"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, dataContextFromStorage, modeFromStorage } from "@/lib/client";
import type { EvidenceItem, MarketFamily, ThesisRevision } from "@/lib/domain/types";
import { Button, Card, Empty } from "@/components/ui";
import { VoicePanel } from "@/components/VoicePanel";
import { formatTime } from "@/lib/format";
import { MarketPriceHistory } from "@/components/MarketPriceHistory";
import { useModeChange } from "@/lib/use-mode-change";

export default function TopicPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const [family, setFamily] = useState<MarketFamily | null>(null);
  const [relatedContracts, setRelatedContracts] = useState<{ slug: string; label: string; instrumentSymbol: string; bid: string | null; ask: string | null }[]>([]);
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [topicError, setTopicError] = useState("");
  const [draftError, setDraftError] = useState("");
  const [busy, setBusy] = useState(false);

  const loadTopic = useCallback(async () => {
    const mode = dataContextFromStorage();
    setTopicError("");
    try {
      const res = await api<{ family: MarketFamily; relatedContracts: typeof relatedContracts; evidence: EvidenceItem[] }>(`/api/topics/${slug}?mode=${mode}`);
      setFamily(res.family);
      setRelatedContracts(res.relatedContracts || []);
      setEvidence(res.evidence);
    } catch (err) {
      setTopicError(err instanceof Error ? err.message : "Topic data could not be loaded.");
    }
  }, [slug]);

  useEffect(() => { void loadTopic(); }, [loadTopic]);
  useModeChange(() => { void loadTopic(); });

  async function formView() {
    if (!family) return;
    setBusy(true);
    setDraftError("");
    try {
      const lower = family.predicates[0]?.threshold ?? null;
      const upper = family.predicates[1]?.threshold ?? null;
      const res = await api<{ thesis: ThesisRevision }>("/api/theses", {
        method: "POST",
        body: JSON.stringify({
          topicSlug: family.slug,
          familyId: family.id,
          familyVersion: family.version,
          mode: modeFromStorage(),
          template: family.predicates.length === 1 && family.contracts.length === 1 ? "binary" : family.predicates.length >= 2 ? "range" : "directional",
          lowerThreshold: family.predicates.length === 1 && family.contracts.length === 1 ? null : lower,
          upperThreshold: family.predicates.length === 1 && family.contracts.length === 1 ? null : upper,
          direction: "yes",
          rationale: "",
          evidenceIds: evidence.map((e) => e.id),
        }),
      });
      router.push(`/theses/${res.thesis.id}`);
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : "Could not create draft");
    } finally {
      setBusy(false);
    }
  }

  if (topicError && !family) return <Card><p role="alert" className="text-sm text-bad">{topicError}</p><div className="mt-3 flex gap-2"><Button onClick={() => void loadTopic()} kind="secondary">Retry market data</Button><Button href="/explore" kind="ghost">Explore</Button></div></Card>;
  if (!family) return <p>Loading topic…</p>;

  const initialHistory = family.predicates.slice(0, 2).map((predicate) => family.contracts.find((contract) => contract.id === predicate.contractId)).filter((contract) => contract != null);
  const depth = family.contracts[0]?.orderBook;
  const contractRulesUrl = family.contracts[0]?.termsUrl || null;
  const eventRulesUrl = family.sourceEvent.sourceUrl && family.sourceEvent.sourceUrl !== contractRulesUrl ? family.sourceEvent.sourceUrl : null;
  const singleBinary = family.predicates.length === 1 && family.contracts.length === 1;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted"><Link href="/explore">Explore</Link> / Research</p>
      <h1 className="font-serif text-3xl">{family.title}</h1>
      {topicError ? <p role="alert" className="rounded-lg border border-bad/30 bg-white p-3 text-sm text-bad">{topicError}. Showing the previously loaded {family.mode} data. <button type="button" className="text-action underline" onClick={() => void loadTopic()}>Retry market data</button></p> : null}
      <p className="text-sm text-muted">{family.question} · Observation {formatTime(family.observationTime)}</p>
      {family.mode === "live" && family.predicates.length === 1 ? <p className="rounded-lg border border-line bg-white p-3 text-sm text-muted">This research view uses one Gemini contract with YES/NO outcomes. Related contracts remain separate until their settlement rules are verified as one compatible family.</p> : null}
      {family.mode === "replay" ? <p className="rounded-lg bg-[#FFF8E7] p-3 text-xs text-muted">Illustrative replay market and evidence. Values are demonstration fixtures, not current Gemini inventory or news.</p> : null}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(300px,0.85fr)]">
        <div className="space-y-4">
          <MarketPriceHistory illustrative={family.mode === "replay"} series={initialHistory.map((contract, index) => ({ label: contract!.label, color: index === 0 ? "#3559E0" : "#8D6CEB", points: contract!.priceHistory || [] }))} />
          <Card>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-serif text-xl">{singleBinary ? "Selected Gemini contract" : "Related Gemini contracts"}</h2>
              <span className="text-xs text-muted">{family.freshness} market reference{singleBinary ? "" : "s"}</span>
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
            <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="font-serif text-xl">Gemini order book</h2><span className="text-xs text-muted">{depth ? "Snapshot" : "No depth returned"}</span></div>
            {depth ? <>
              <p className="mt-1 text-xs text-muted">Received {formatTime(depth.receivedAt)} · Gemini did not provide a source timestamp in this response. Depth can change before an order is submitted.</p>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                {([["Bids", depth.bids], ["Asks", depth.asks]] as const).map(([label, levels]) => <div key={label}>
                  <h3 className="text-sm font-medium">{label}</h3>
                  {levels.length ? <div className="mt-1 space-y-1">{levels.map((level, index) => <div key={`${label}-${index}`} className="grid grid-cols-2 rounded bg-surface px-2 py-1 text-xs"><span>{level.price}</span><span className="text-right">{level.quantity}</span></div>)}</div> : <p className="mt-1 text-xs text-muted">No levels returned.</p>}
                </div>)}
              </div>
            </> : <p className="mt-2 text-sm text-muted">Gemini returned no order-book levels for this contract. Bid/ask and last-trade values remain reference prices; they do not prove available size or an executable cost.</p>}
          </Card>
          {relatedContracts.length ? <Card>
            <h2 className="font-serif text-xl">Related Gemini contracts</h2>
            <p className="mt-1 text-xs text-muted">Each remains a separate YES/NO proposition until its settlement rules are verified as a compatible family.</p>
            <div className="mt-3 grid gap-2">{relatedContracts.map((contract) => <Link key={contract.slug} href={`/topics/${contract.slug}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line p-3 text-sm hover:border-action"><span>{contract.label}</span><span className="text-xs text-muted">YES bid {contract.bid ?? "—"} · ask {contract.ask ?? "—"}</span></Link>)}</div>
          </Card> : null}
          <Card>
            <h2 className="font-serif text-xl">Resolution rules</h2>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              {family.contracts[0]?.description ? <div className="sm:col-span-2"><dt className="text-muted">Exact Gemini contract wording</dt><dd className="mt-1 whitespace-pre-wrap">{family.contracts[0].description}</dd></div> : <div className="sm:col-span-2"><dt className="text-muted">Exact Gemini contract wording</dt><dd className="mt-1">Gemini did not include contract-level wording in this response. Use the contract rules link when available.</dd></div>}
              {family.contracts[0]?.strike ? <div><dt className="text-muted">Gemini strike</dt><dd>{family.contracts[0].strike.type || "Type not listed"}{family.contracts[0].strike.value ? ` · ${family.contracts[0].strike.value}` : " · value not available"}{family.contracts[0].strike.availableAt ? ` · available ${formatTime(family.contracts[0].strike.availableAt)}` : ""}</dd></div> : null}
              <div><dt className="text-muted">Observation</dt><dd>{formatTime(family.observationTime)}</dd></div>
              <div><dt className="text-muted">Source</dt><dd>{family.sourceEvent.sourceAgency || "Gemini listed source"} / {family.contracts[0]?.source || family.sourceEvent.sourceIndex || "see terms"}</dd></div>
              <div><dt className="text-muted">Market status</dt><dd className="capitalize">{family.sourceEvent.status}</dd></div>
              <div><dt className="text-muted">Trade cutoff</dt><dd>{family.closeTime ? formatTime(family.closeTime) : "Not provided by this market response"}</dd></div>
            </dl>
            {contractRulesUrl ? <a className="mt-3 inline-block text-sm text-action underline" href={contractRulesUrl} target="_blank" rel="noreferrer">Open exact Gemini contract rules</a> : null}
            {eventRulesUrl ? <a className="mt-3 inline-block text-sm text-action" href={eventRulesUrl} target="_blank" rel="noreferrer">Open event-level Gemini rules</a> : null}
            <p className="mt-3 break-all border-t border-line pt-3 text-xs text-muted">Source snapshot received {formatTime(family.sourceEvent.fetchedAt)} · SHA-256 {family.sourceEvent.payloadHash}</p>
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
            <p className="mt-2 text-sm text-muted">{singleBinary ? "Speak or type an opinion. For this contract, choose whether Gemini resolves its exact proposition YES or NO. Edit and confirm before moving to Build." : "Speak or type an opinion. Choose supported boundaries from the listed contracts, edit the proposal, and confirm before moving to Build."}</p>
            {draftError ? <div role="alert" className="mt-3 rounded-lg border border-bad/30 bg-white p-3 text-sm text-bad"><p>{draftError}</p><div className="mt-2"><Button kind="ghost" onClick={() => void formView()} disabled={busy}>Retry draft creation</Button></div></div> : null}
            <div className="mt-3"><Button onClick={formView} disabled={busy || Boolean(draftError)}>{busy ? "Saving draft…" : "Form a view manually"}</Button></div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
