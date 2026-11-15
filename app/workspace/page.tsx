"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { ThesisRevision } from "@/lib/domain/types";
import { Button, Card, Empty } from "@/components/ui";

export default function Workspace() {
  const [theses, setTheses] = useState<ThesisRevision[]>([]);
  const [tab, setTab] = useState("draft");
  useEffect(() => {
    api<{ theses: ThesisRevision[] }>("/api/theses").then((r) => setTheses(r.theses || []));
  }, []);
  const rows = theses.filter((t) => (tab === "draft" ? t.status === "draft" : tab === "confirmed" ? t.status === "confirmed" : true));
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl">Workspace</h1>
      <div className="flex gap-2">
        {["draft", "confirmed", "quoted"].map((t) => (
          <button key={t} className={`min-h-11 rounded-lg border px-3 ${tab === t ? "bg-ink text-white" : "border-line"}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>
      {rows.length === 0 ? <Empty title="Nothing here">Drafts stay private. Bulk trading is not in this menu.</Empty> : null}
      {rows.map((t) => (
        <Card key={t.id}>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{t.topicSlug}</p>
              <p className="text-sm text-muted">{t.template} · rev {t.revision}</p>
            </div>
            <Button href={`/theses/${t.id}`}>Open</Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
