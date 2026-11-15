"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, modeFromStorage } from "@/lib/client";
import type { EvidenceItem, MarketFamily, ThesisRevision } from "@/lib/domain/types";
import { Button, Card, Empty } from "@/components/ui";
import { VoicePanel } from "@/components/VoicePanel";
import { formatTime } from "@/lib/format";
import { MarketPriceHistory } from "@/components/MarketPriceHistory";
import { useModeChange } from "@/lib/use-mode-change";

export default function TopicPage() {
  const { slug } = useParams<{ slug: string }>();
  const [family, setFamily] = useState<MarketFamily | null>(null);
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const loadTopic = useCallback(async () => {
    const mode = modeFromStorage() === "live" ? "live" : "replay";
    setError("");
    try {
      const res = await api<{ family: MarketFamily; evidence: EvidenceItem[] }>(`/api/topics/${slug}?mode=${mode}`);
      setFamily(res.family);
      setEvidence(res.evidence);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Topic data could not be loaded.");
    }
  }, [slug]);

  useEffect(() => { void loadTopic(); }, [loadTopic]);
  useModeChange(() => { void loadTopic(); });

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

  if (error && !family) return <Card><p role="alert" className="text-sm text-bad">{error}</p><div className="mt-3 flex gap-2"><Button onClick={() => void loadTopic()} kind="secondary">Retry</Button><Button href="/explore" kind="ghost">Explore</Button></div></Card>;
  if (!family) return <p>Loading topic…</p>;

  const initialHistory = family.predicates.slice(0, 2).map((predicate) => family.contracts.find((contract) => contract.id === predicate.contractId)).filter((contract) => contract != null);
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted"><Link href="/explore">Explore</Link> / Research</p>
      <h1 className="font-serif text-3xl">{family.title}</h1>
      {error ? <p role="alert" className="rounded-lg border border-bad/30 bg-white p-3 text-sm text-bad">{error}. Showing the previously loaded {family.mode} data. <button type="button" className="text-action underline" onClick={() => void loadTopic()}>Retry</button></p> : null}
      <p className="text-sm text-muted">{family.question} · Settlement {formatTime(family.observationTime)}</p>
      {family.mode === "replay" ? <p className="rounded-lg bg-[#FFF8E7] p-3 text-xs text-muted">Illustrative replay market and evidence. Values are demonstration fixtures, not current Gemini inventory or news.</p> : null}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(300px,0.85fr)]">
        <div className="space-y-4">
          <MarketPriceHistory illustrative={family.mode === "replay"} series={initialHistory.map((contract, index) => ({ label: contract!.label, color: index === 0 ? "#3559E0" : "#8D6CEB", points: contract!.priceHistory || [] }))} />
          <Card>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-serif text-xl">Related Gemini contracts</h2>
              <span className="text-xs text-muted">{family.freshness} market references</span>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead><tr><th className="border-b border-line py-2 pr-3">Contract</th><th className="border-b border-line py-2 pr-3">Bid · YES</th><th className="border-b border-line py-2 pr-3">Ask · YES</th><th className="border-b border-line py-2">Last trade</th></tr></thead>
                <tbody>{family.contracts.map((contract) => (
                  <tr key={contract.id}>
                    <td className="border-b border-line py-2 pr-3">{contract.label}</td>
                    <td className="border-b border-line py-2 pr-3">{contract.bid ?? "—"}</td>
                    <td className="border-b border-line py-2 pr-3">{contract.ask ?? "—"}</td>
                    <td className="border-b border-line py-2">{contract.lastTrade ?? "—"}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted">Displayed prices are references and may not have executable size. Source: Gemini event {family.sourceEvent.ticker}.</p>
          </Card>
          <Card>
            <h2 className="font-serif text-xl">Resolution rules</h2>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-muted">Observation</dt><dd>{formatTime(family.observationTime)}</dd></div>
              <div><dt className="text-muted">Source</dt><dd>{family.sourceEvent.sourceAgency || "Gemini listed source"} / {family.sourceEvent.sourceIndex || "see terms"}</dd></div>
              <div><dt className="text-muted">Market status</dt><dd className="capitalize">{family.sourceEvent.status}</dd></div>
              <div><dt className="text-muted">Trade cutoff</dt><dd>{formatTime(family.closeTime)}</dd></div>
            </dl>
            {family.sourceEvent.sourceUrl ? <a className="mt-3 inline-block text-sm text-action" href={family.sourceEvent.sourceUrl} target="_blank" rel="noreferrer">Open original Gemini rules</a> : null}
          </Card>
          <Card>
            <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="font-serif text-xl">Evidence</h2>{family.mode === "replay" ? <span className="text-xs text-muted">Illustrative</span> : null}</div>
            {evidence.length ? <div className="mt-3 grid gap-3 md:grid-cols-2">{evidence.map((item) => (
              <article key={item.id} className="rounded-lg border border-line p-3">
                <span className={`inline-flex rounded-full px-2 py-1 text-xs capitalize ${item.stance === "supports" ? "bg-[#E3F5EC] text-good" : item.stance === "challenges" ? "bg-[#FCE8E8] text-bad" : "bg-[#E9EEFF] text-action"}`}>{item.stance || "context"}</span>
                <Link href={`/topics/${slug}/evidence/${item.id}`} className="mt-2 block font-medium">{item.title}</Link>
                <p className="mt-1 text-xs text-muted">{item.publisher} · retrieved {formatTime(item.retrievedAt)}</p>
                <p className="mt-2 text-sm">{item.excerpt}</p>
              </article>
            ))}</div> : <p className="mt-3 text-sm text-muted">No evidence feed is available for this market. You can inspect its rules and create a view manually.</p>}
          </Card>
        </div>
        <aside className="space-y-4">
          <VoicePanel slug={family.slug} family={family} evidence={evidence} title="What do you think will happen?" />
          <Card>
            <h2 className="font-serif text-xl">Your view</h2>
            <p className="mt-2 text-sm text-muted">Speak or type an opinion. Thesis proposes a range from listed contracts; edit and confirm it before moving to Build.</p>
            <div className="mt-3"><Button onClick={formView} disabled={busy}>{busy ? "Saving draft…" : "Form a view manually"}</Button></div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
