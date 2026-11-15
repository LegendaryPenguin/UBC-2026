"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, modeFromStorage } from "@/lib/client";
import type { EvidenceItem, MarketFamily, ThesisRevision } from "@/lib/domain/types";
import { Button, Card, Empty } from "@/components/ui";
import { VoicePanel } from "@/components/VoicePanel";
import { formatTime } from "@/lib/format";

export default function TopicPage() {
  const { slug } = useParams<{ slug: string }>();
  const [family, setFamily] = useState<MarketFamily | null>(null);
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const mode = modeFromStorage() === "live" ? "live" : "replay";
    api<{ family: MarketFamily; evidence: EvidenceItem[] }>(`/api/topics/${slug}?mode=${mode}`)
      .then((res) => {
        setFamily(res.family);
        setEvidence(res.evidence);
      })
      .catch((err) => setError(err.message));
  }, [slug]);

  async function formView() {
    if (!family) return;
    setBusy(true);
    try {
      const lower = family.predicates[0]?.threshold ?? null;
      const upper = family.predicates[1]?.threshold ?? null;
      const res = await api<{ thesis: ThesisRevision }>("/api/theses", {
        method: "POST",
        body: JSON.stringify({
          topicSlug: family.slug,
          familyId: family.id,
          familyVersion: family.version,
          template: family.predicates.length >= 2 ? "range" : "directional",
          lowerThreshold: lower,
          upperThreshold: upper,
          direction: "yes",
          rationale: "",
          evidenceIds: evidence.map((e) => e.id),
        }),
      });
      window.location.href = `/theses/${res.thesis.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create draft");
    } finally {
      setBusy(false);
    }
  }

  if (error) return <Empty title="Topic unavailable">{error}</Empty>;
  if (!family) return <p>Loading topic…</p>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        <Link href="/explore">Explore</Link> / {family.slug}
      </p>
      <h1 className="font-serif text-3xl">{family.title}</h1>
      <p className="text-muted">{family.question}</p>
      <Card>
        <h2 className="font-serif text-xl">Rules</h2>
        <ul className="mt-2 space-y-1 text-sm">
          <li>Observation: {formatTime(family.observationTime)}</li>
          <li>Source: {family.sourceEvent.sourceAgency || "listed Gemini source"} / {family.sourceEvent.sourceIndex || "see terms"}</li>
          <li>Status: {family.sourceEvent.status}</li>
          <li>Mode: {family.mode} · freshness {family.freshness}</li>
          <li>Longstop: {formatTime(family.longstopTime)}</li>
        </ul>
        {family.sourceEvent.sourceUrl ? (
          <a className="mt-3 inline-block text-sm text-action" href={family.sourceEvent.sourceUrl} target="_blank" rel="noreferrer">
            Open original terms
          </a>
        ) : null}
      </Card>
      <Card>
        <h2 className="font-serif text-xl">Listed thresholds</h2>
        <table className="mt-3 w-full text-left text-sm">
          <thead>
            <tr>
              <th className="border-b border-line py-2">Contract</th>
              <th className="border-b border-line py-2">Bid</th>
              <th className="border-b border-line py-2">Ask</th>
            </tr>
          </thead>
          <tbody>
            {family.contracts.map((c) => (
              <tr key={c.id}>
                <td className="py-2">{c.label}</td>
                <td>{c.bid ?? "—"}</td>
                <td>{c.ask ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-muted">These are Gemini reference quotes, not executable Arc offers.</p>
      </Card>
      <Card>
        <h2 className="font-serif text-xl">Evidence</h2>
        <div className="mt-3 space-y-3">
          {evidence.map((e) => (
            <div key={e.id} className="rounded-lg border border-line p-3">
              <Link href={`/topics/${slug}/evidence/${e.id}`} className="font-medium">{e.title}</Link>
              <p className="text-xs text-muted">{e.publisher} · retrieved {formatTime(e.retrievedAt)}</p>
              <p className="mt-2 text-sm">{e.excerpt}</p>
            </div>
          ))}
        </div>
      </Card>
      <VoicePanel slug={family.slug} />
      <div className="flex flex-wrap gap-2">
        <Button onClick={formView} disabled={busy}>{busy ? "Saving draft…" : "Form my view"}</Button>
        <Button href={`/calendar`} kind="ghost">Deadlines</Button>
      </div>
    </div>
  );
}
