"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, modeFromStorage } from "@/lib/client";
import type { EvidenceItem } from "@/lib/domain/types";
import { Card } from "@/components/ui";
import { formatTime } from "@/lib/format";

export default function EvidencePage() {
  const { slug, eid } = useParams<{ slug: string; eid: string }>();
  const [item, setItem] = useState<EvidenceItem | null>(null);
  useEffect(() => {
    const mode = modeFromStorage() === "live" ? "live" : "replay";
    api<{ evidence: EvidenceItem[] }>(`/api/topics/${slug}?mode=${mode}`).then((r) => {
      setItem(r.evidence.find((e) => e.id === eid) || null);
    });
  }, [slug, eid]);
  if (!item) return <p>Source unavailable. Archived metadata is shown only when retrieved.</p>;
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl">{item.title}</h1>
      <Card>
        <p className="text-sm">{item.publisher} · published {formatTime(item.publishedAt)} · retrieved {formatTime(item.retrievedAt)}</p>
        <p className="mt-3">{item.excerpt}</p>
        <a className="mt-3 inline-block text-action" href={item.url} target="_blank" rel="noreferrer">Open original</a>
      </Card>
    </div>
  );
}
