"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/client";
import { Button, Card } from "@/components/ui";
import type { ThesisRevision } from "@/lib/domain/types";

export default function Shared() {
  const { token } = useParams<{ token: string }>();
  const [thesis, setThesis] = useState<ThesisRevision | null>(null);
  useEffect(() => {
    api<{ thesis: ThesisRevision }>(`/api/publish?token=${token}`).then((r) => setThesis(r.thesis)).catch(() => setThesis(null));
  }, [token]);
  if (!thesis) return <p>Snapshot unavailable.</p>;
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl">Shared thesis</h1>
      <Card>
        <p>{thesis.topicSlug}</p>
        <p className="text-sm">{thesis.rationale || "Rationale was not included."}</p>
        <Button href={`/topics/${thesis.topicSlug}`}>Fork privately</Button>
      </Card>
    </div>
  );
}
