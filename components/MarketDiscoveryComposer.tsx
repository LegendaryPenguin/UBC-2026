"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, createMarketResearchDraft, findRecordedRangeMarket, setDataContext, startRecordedRehearsal } from "@/lib/client";
import type { MarketFamily } from "@/lib/domain/types";
import { marketDiscovery, marketObservation, researchConversation, type ResearchTurn } from "@/lib/research";
import { ConversationalMic } from "@/components/ConversationalMic";
import { researchTime } from "@/components/ResearchBoard";
import { Button, Card, inputCls } from "@/components/ui";

type Match = { id: string; version: string; slug: string; title: string; contract?: string; observationTime?: string | null; fetchedAt?: string; instrument?: string; eventTicker?: string; predicates: number };

export function MarketDiscoveryComposer({ onStart }: { onStart: () => void }) {
  const router = useRouter();
  const [voice, setVoice] = useState(false);
  const [talking, setTalking] = useState(false);
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<{ question: string; reply: string; matches: Match[]; recorded?: MarketFamily } | null>(null);
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState("");
  const [error, setError] = useState("");
  const [researchTurns, setResearchTurns] = useState<ResearchTurn[]>([]);
  const busy = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    api<{ services: { id: string; state: string }[] }>("/api/status", { signal: controller.signal })
      .then(({ services }) => setVoice(services.some((service) => service.id === "voice" && service.state === "available"))).catch(() => {});
    return () => controller.abort();
  }, []);

  async function search(text: string, signal?: AbortSignal) {
    const input = text.trim().slice(0, 3000);
    if (!input || busy.current || opening) return;
    busy.current = true;
    setQuestion(input);
    setLoading(true);
    setError("");
    try {
      const conversation = researchConversation(researchTurns, input);
      const { answer, marketMatches = [] } = await api<{ answer: string; marketMatches?: Match[] }>("/api/research", {
        method: "POST", signal, body: JSON.stringify({ question: input, conversation, mode: "live", context: "research" }),
      });
      const observation = marketDiscovery(input, conversation);
      const recorded = observation.asset && observation.view && !marketMatches.some((match) => match.predicates >= 2)
        ? await findRecordedRangeMarket(observation.observationText, signal).catch(() => undefined)
        : undefined;
      if (signal?.aborted) return;
      setResult({ question: observation.observationText, reply: answer, matches: marketMatches, recorded });
      setResearchTurns([...conversation, { role: "assistant", content: answer }]);
      return marketMatches.length ? `I found ${marketMatches.length} live Gemini ${marketMatches.length === 1 ? "match" : "matches"}. Check their settlement times before choosing. ${recorded ? "There is also a labeled paper example for exploring a range." : ""}` : answer;
    } catch (cause) {
      if (!signal?.aborted) setError(cause instanceof Error ? cause.message : "Gemini search failed. Try again.");
    } finally { busy.current = false; setLoading(false); }
  }

  async function openResearch(match: Match | MarketFamily, replay: boolean) {
    if (!result || opening || busy.current) return;
    busy.current = true;
    setOpening(match.slug);
    setError("");
    try {
      const thesis = await createMarketResearchDraft(match, result.question, replay ? "replay" : "live");
      if (replay) startRecordedRehearsal();
      else setDataContext("live");
      router.push(`/theses/${thesis.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Research could not be opened. Try again.");
    } finally { busy.current = false; setOpening(""); }
  }

  const observation = result ? marketObservation(result.question) : null;
  const fields = [observation?.asset?.name, observation?.view, observation?.horizon].filter(Boolean);
  return <Card className="market-discovery space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-serif text-2xl font-bold">What are you thinking about?</h2>
      <span className="source-pill">Gemini Prediction Markets</span>
    </div>
    <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); void search(question); }}>
      <label className="sr-only" htmlFor="dashboard-observation">Your observation</label>
      <textarea id="dashboard-observation" className={`${inputCls()} min-h-20 resize-y p-3`} maxLength={3000} value={question} onChange={(event) => { setQuestion(event.target.value); setResult(null); }}
        placeholder="Describe something you noticed or expect to happen…" disabled={loading || Boolean(opening)} />
      <div className="flex flex-wrap items-start gap-2">
        {voice ? <ConversationalMic primary disabled={loading || Boolean(opening)} onActive={setTalking} onTurn={search} /> : null}
        <Button type="submit" kind={voice ? "secondary" : "primary"} icon="search" disabled={!question.trim() || loading || talking || Boolean(opening)}>{loading ? "Finding markets…" : "Find Gemini markets"}</Button>
        <Button type="button" kind="ghost" onClick={onStart} disabled={Boolean(opening)}>Start a thesis</Button>
      </div>
    </form>
    {error ? <p className="text-sm text-bad" role="alert">{error}</p> : null}
    {result ? <section aria-label="Market discovery results" className="space-y-3 border-t border-line pt-3" aria-live="polite">
      {fields.length ? <div className="flex flex-wrap gap-2">{fields.map((value) => <span key={value} className="source-pill capitalize">{value}</span>)}</div> : null}
      {result.matches.length === 0 ? <p className="text-sm th-muted">{result.reply}</p> : <>
        <h3 className="text-sm font-semibold">Live Gemini matches</h3>
        {observation?.horizon ? <p className="text-xs th-muted">Requested horizon {observation.horizon}. Check each listed settlement time before choosing.</p> : null}
        <div className="market-discovery__matches">{result.matches.slice(0, 3).map((match) => <article key={match.slug} className="market-discovery__match">
          <h4 className="font-serif text-lg font-bold">{match.title}</h4>
          <p className="mt-1 text-sm">{observation?.asset ? `${observation.asset.name} price · ` : ""}{match.contract || "Verified contract thresholds"}</p>
          <p className="mt-1 text-xs th-muted">Settles {researchTime(match.observationTime)}{match.fetchedAt ? ` · Updated ${researchTime(match.fetchedAt)}` : ""}</p>
          {match.instrument ? <p className="mt-1 truncate text-xs th-muted" title={match.instrument}>{match.instrument}</p> : null}
          <Button className="mt-2" kind="secondary" icon="arrow-right" disabled={Boolean(opening)} onClick={() => void openResearch(match, false)}>{opening === match.slug ? "Opening…" : "Open Research"}</Button>
        </article>)}</div>
      </>}
      {result.recorded ? <div className="th-alert flex flex-wrap items-center justify-between gap-2">
        <div><p className="text-sm font-semibold">{result.recorded.title} · recorded Gemini example</p><p className="text-xs th-muted">Explore compatible thresholds and a simulated Arc quote with the recorded observation.</p></div>
        <Button kind="secondary" disabled={Boolean(opening)} onClick={() => void openResearch(result.recorded!, true)}>{opening === result.recorded.slug ? "Opening…" : "Open paper rehearsal"}</Button>
      </div> : null}
    </section> : null}
  </Card>;
}
