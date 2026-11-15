"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/client";
import type { ThesisRevision } from "@/lib/domain/types";
import { Card } from "@/components/ui";

export default function History() {
  const { id } = useParams<{ id: string }>();
  const [thesis, setThesis] = useState<ThesisRevision | null>(null);
  useEffect(() => {
    api<{ thesis: ThesisRevision }>(`/api/theses/${id}`).then((r) => setThesis(r.thesis));
  }, [id]);
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl">Revision history</h1>
      <Card>
        <p className="text-sm">Current revision {thesis?.revision}. Restore creates a new draft. History is not rewritten.</p>
      </Card>
    </div>
  );
}
