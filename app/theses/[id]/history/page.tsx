"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/client";
import type { ThesisHistoryRecord } from "@/lib/domain/types";
import { Button, Card, Empty } from "@/components/ui";

export default function History() {
  const { id } = useParams<{ id: string }>();
  const [versions, setVersions] = useState<ThesisHistoryRecord[]>([]);
  const [currentRevision, setCurrentRevision] = useState(0);
  const [pendingRevision, setPendingRevision] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ versions: ThesisHistoryRecord[]; currentRevision: number }>(`/api/theses/${id}/history`)
      .then((result) => {
        setVersions(result.versions);
        setCurrentRevision(result.currentRevision);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "History could not be loaded."))
      .finally(() => setLoading(false));
  }, [id]);

  async function restore(revision: number) {
    setPendingRevision(revision);
    setError("");
    try {
      const result = await api<{ thesis: { id: string } }>(`/api/theses/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "restore", revision }),
      });
      window.location.href = `/theses/${result.thesis.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Revision could not be restored.");
      setPendingRevision(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-3xl">Revision history</h1>
        <p className="mt-1 text-sm text-muted">Current revision {currentRevision}. Restoring a version creates a new draft.</p>
      </div>
      {error ? <p role="alert" className="text-sm text-bad">{error}</p> : null}
      {loading ? <p>Loading revisions…</p> : null}
      {!loading && !versions.length && !error ? <Empty title="No saved versions">Save or confirm a view to create its first snapshot.</Empty> : null}
      {versions.map((version) => (
        <Card key={version.id} className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 className="font-serif text-xl">Revision {version.revision}</h2>
              <p className="text-sm text-muted">{version.reason} · {new Date(version.recordedAt).toLocaleString()}</p>
            </div>
            <Button onClick={() => restore(version.revision)} disabled={pendingRevision !== null}>
              {pendingRevision === version.revision ? "Creating draft…" : "Restore as new draft"}
            </Button>
          </div>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="text-muted">Payoff</dt><dd>{version.snapshot.template}</dd></div>
            <div><dt className="text-muted">Status</dt><dd>{version.snapshot.status}</dd></div>
            <div><dt className="text-muted">Direction</dt><dd>{version.snapshot.direction || "Not set"}</dd></div>
            <div><dt className="text-muted">Lower threshold</dt><dd>{version.snapshot.lowerThreshold ?? "Not set"}</dd></div>
            <div><dt className="text-muted">Upper threshold</dt><dd>{version.snapshot.upperThreshold ?? "Not set"}</dd></div>
          </dl>
          {version.snapshot.rationale ? (
            <div>
              <h3 className="text-sm font-medium">Rationale</h3>
              <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{version.snapshot.rationale}</p>
            </div>
          ) : null}
          {version.snapshot.invalidation ? (
            <div>
              <h3 className="text-sm font-medium">Reconsider if</h3>
              <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{version.snapshot.invalidation}</p>
            </div>
          ) : null}
        </Card>
      ))}
    </div>
  );
}
