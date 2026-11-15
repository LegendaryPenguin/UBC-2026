"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { Button, Empty } from "@/components/ui";
import type { NotificationItem } from "@/lib/domain/types";

export default function Inbox() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  useEffect(() => {
    api<{ notifications: NotificationItem[] }>("/api/alerts").then((r) => setItems(r.notifications || []));
  }, []);
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl">Inbox</h1>
      {items.length === 0 ? <Empty title="No messages">Notifications never place trades.</Empty> : null}
      {items.map((n) => (
        <div key={n.id} className="rounded-card border border-line bg-white p-4">
          <Link href={n.href} className="font-medium">{n.title}</Link>
          <p className="text-sm text-muted">{n.body}</p>
          <Button kind="ghost" onClick={() => api("/api/alerts", { method: "PATCH", body: JSON.stringify({ id: n.id, action: "read" }) })}>Mark read</Button>
        </div>
      ))}
    </div>
  );
}
