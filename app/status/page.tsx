"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Card } from "@/components/ui";

export default function StatusPage() {
  const [data, setData] = useState<{ updatedAt: string; services: { id: string; label: string; state: string; note: string }[] } | null>(null);
  useEffect(() => {
    api<NonNullable<typeof data>>("/api/status").then(setData);
  }, []);
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl">Status</h1>
      <p className="text-sm text-muted">Updated {data?.updatedAt}</p>
      {data?.services.map((s) => (
        <Card key={s.id}>
          <p className="font-medium">{s.label} · {s.state}</p>
          <p className="text-sm text-muted">{s.note}</p>
        </Card>
      ))}
    </div>
  );
}
