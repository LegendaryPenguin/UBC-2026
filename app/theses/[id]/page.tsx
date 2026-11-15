"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, modeFromStorage } from "@/lib/client";
import type { EvidenceItem, MarketFamily, ThesisRevision } from "@/lib/domain/types";
import { VoicePanel } from "@/components/VoicePanel";
import { Button, Card, Empty, Field, inputCls } from "@/components/ui";
import { ThesisWorkspaceTabs } from "@/components/ThesisWorkspaceTabs";
import { ThesisViewPanel } from "@/components/ThesisViewPanel";
import { MarketPriceHistory } from "@/components/MarketPriceHistory";
import { useModeChange } from "@/lib/use-mode-change";

export default function ThesisEditor() {
  const { id } = useParams<{ id: string }>();
  const [thesis, setThesis] = useState<ThesisRevision | null>(null);
  const [family, setFamily] = useState<MarketFamily | null>(null);
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<"save" | "confirm" | "duplicate" | null>(null);
  const [dirty, setDirty] = useState(false);
  const [reviewingConfirmation, setReviewingConfirmation] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api<{ thesis: ThesisRevision }>(`/api/theses/${id}`)
      .then(async ({ thesis: current }) => {
        if (!active) return;
        setThesis(current);
        const mode = modeFromStorage() === "live" ? "live" : "replay";
        try {
          const topic = await api<{ family: MarketFamily; evidence: EvidenceItem[] }>(`/api/topics/${current.topicSlug}?mode=${mode}`);
          if (active) {
            setFamily(topic.family);
            setEvidence(topic.evidence);
          }
        } catch {
          if (active) setNotice("Topic data is unavailable. Manual editing and saved-view recovery remain available.");
        }
      })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : "Thesis could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  const refreshMarketData = useCallback(async () => {
    if (!thesis?.topicSlug) return;
    const mode = modeFromStorage() === "live" ? "live" : "replay";
    try {
      const topic = await api<{ family: MarketFamily; evidence: EvidenceItem[] }>(`/api/topics/${thesis.topicSlug}?mode=${mode}`);
      setFamily(topic.family);
      setEvidence(topic.evidence);
      setNotice(`Market research refreshed for ${mode === "live" ? "Live data" : "Replay"}. Your view edits remain here.`);
    } catch (err) {
      setNotice(err instanceof Error ? `Market data could not refresh: ${err.message}. Your view edits remain here.` : "Market data could not refresh. Your view edits remain here.");
    }
  }, [thesis?.topicSlug]);

  useModeChange(() => { void refreshMarketData(); });

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  function change<K extends keyof ThesisRevision>(key: K, value: ThesisRevision[K]) {
    if (!thesis) return;
    setThesis({ ...thesis, [key]: value });
    setDirty(true);
    setNotice("");
  }

  async function save(action: "save" | "confirm" | "duplicate" = "save") {
    if (!thesis) return;
    setSaving(action);
    setError("");
    setNotice("");
    try {
      const res = await api<{ thesis: ThesisRevision }>(`/api/theses/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...thesis, action: action === "save" ? undefined : action }),
      });
      if (action === "duplicate") {
        window.location.href = `/theses/${res.thesis.id}`;
        return;
      }
      setThesis(res.thesis);
      setDirty(false);
      if (action === "confirm") {
        window.location.href = `/theses/${id}/build`;
        return;
      }
      setNotice(`Saved as revision ${res.thesis.revision}. Your existing view remains a draft until you confirm it.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "View could not be saved. Your edits remain here so you can retry.");
    } finally {
      setSaving(null);
    }
  }

  function backToWorkspace() {
    if (dirty && !window.confirm("Discard these unsaved view edits and return to the workspace?")) return;
    window.location.href = "/workspace";
  }

  function openHistory() {
    if (dirty && !window.confirm("Discard these unsaved view edits and open revision history?")) return;
    window.location.href = `/theses/${id}/history`;
  }

  if (loading) return <p role="status">Loading thesis…</p>;
  if (error && !thesis) return <Empty title="Thesis unavailable">{error}</Empty>;
  if (!thesis) return <Empty title="Thesis unavailable">This view could not be found.</Empty>;
  const historyPredicates = [thesis.lowerThreshold, thesis.upperThreshold]
    .filter((threshold): threshold is number => threshold != null)
    .map((threshold) => family?.predicates.find((predicate) => predicate.threshold === threshold))
    .filter((predicate) => predicate != null);
  const historyContracts = historyPredicates
    .map((predicate) => family?.contracts.find((contract) => contract.id === predicate.contractId))
    .filter((contract) => contract != null);

  return (
    <div className="space-y-4">
      <p className="text-xs uppercase tracking-wide text-muted">{thesis.topicSlug.replaceAll("-", " ")}</p>
      <h1 className="font-serif text-3xl">Research your view</h1>
      <p className="text-sm text-muted">Revision {thesis.revision} · {thesis.status}. Research and saved views do not require a wallet. Confirming opens payoff design without requesting a quote or submitting a trade.</p>
      <ThesisWorkspaceTabs
        thesisId={id}
        current="Research"
        lockedTabs={thesis.status === "draft" ? ["Build", "Compare"] : []}
        onNavigate={() => !dirty || window.confirm("Discard these unsaved view edits and leave Research?")}
      />
      {error ? <p role="alert" className="rounded-lg border border-bad/30 bg-white p-3 text-sm text-bad">{error}</p> : null}
      {notice ? <p role="status" className="rounded-lg border border-line bg-white p-3 text-sm text-muted">{notice}</p> : null}
      {family ? (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(300px,0.85fr)]">
          <div className="space-y-4">
            <MarketPriceHistory
              illustrative={family.mode === "replay"}
              series={historyContracts.map((contract, index) => ({
                label: contract!.label,
                color: index === 0 ? "#3559E0" : "#8D6CEB",
                points: contract!.priceHistory || [],
              }))}
            />
            <Card>
              <h2 className="font-serif text-xl">{family.title} · market expectations</h2>
              <p className="mt-1 text-sm text-muted">{family.question}</p>
              <p className="mt-2 text-xs text-muted">
                {family.mode === "replay" ? "Illustrative recorded snapshot" : "Gemini reference data"} · {family.freshness} · observed {family.observationTime ? new Date(family.observationTime).toLocaleString() : "time not provided"}
              </p>
              {family.mode === "replay" ? <p className="mt-2 rounded-lg bg-[#FFF8E7] p-3 text-xs text-muted">Replay prices and evidence are walkthrough fixtures. They are not current prices, news, or executable quotes.</p> : null}
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
              <p className="mt-2 text-xs text-muted">Prices show market references only. They do not guarantee available size or execution.</p>
            </Card>
            <Card>
              <h2 className="font-serif text-xl">Resolution rules</h2>
              <dl className="mt-3 space-y-2 text-sm">
                <div><dt className="text-muted">Observation</dt><dd>{family.observationTime ? new Date(family.observationTime).toLocaleString() : "Not provided"}</dd></div>
                <div><dt className="text-muted">Source</dt><dd>{family.sourceEvent.sourceAgency || "Gemini listed source"}{family.sourceEvent.sourceIndex ? ` · ${family.sourceEvent.sourceIndex}` : ""}</dd></div>
                <div><dt className="text-muted">Market status</dt><dd className="capitalize">{family.sourceEvent.status}</dd></div>
                <div><dt className="text-muted">Trade cutoff</dt><dd>{family.closeTime ? new Date(family.closeTime).toLocaleString() : "Not provided"}</dd></div>
              </dl>
              {family.sourceEvent.sourceUrl ? <a className="mt-3 inline-block text-sm text-action" href={family.sourceEvent.sourceUrl} target="_blank" rel="noreferrer">Read original Gemini rules</a> : null}
            </Card>
            {evidence.length ? (
              <Card>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-serif text-xl">Evidence board</h2>
                  {family.mode === "replay" ? <span className="text-xs text-muted">Illustrative replay evidence</span> : null}
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {evidence.map((item) => (
                    <article key={item.id} className="rounded-lg border border-line p-3">
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs capitalize ${item.stance === "supports" ? "bg-[#E3F5EC] text-good" : item.stance === "challenges" ? "bg-[#FCE8E8] text-bad" : "bg-[#E9EEFF] text-action"}`}>{item.stance || "context"}</span>
                      <Link href={`/topics/${thesis.topicSlug}/evidence/${item.id}`} className="mt-2 block font-medium">{item.title}</Link>
                      <p className="mt-1 text-xs text-muted">{item.publisher} · {new Date(item.retrievedAt).toLocaleString()}</p>
                      <p className="mt-2 text-sm">{item.excerpt}</p>
                    </article>
                  ))}
                </div>
                <p className="mt-3 text-xs text-muted">Evidence cards stay tied to this thesis. Review the original source before relying on a claim.</p>
              </Card>
            ) : <Card><h2 className="font-serif text-xl">Evidence</h2><p className="mt-2 text-sm text-muted">No current evidence cards are available for this market. Research and manual view controls remain available.</p></Card>}
          </div>
          <aside className="space-y-4">
            <VoicePanel
              slug={family.slug}
              family={family}
              evidence={evidence}
              thesis={thesis}
              onThesisChange={(updated) => { setThesis(updated); setDirty(false); setNotice(`Voice-assisted edit saved as draft revision ${updated.revision}.`); }}
              context="view"
              title="Talk through your view"
            />
            <ThesisViewPanel
              thesis={thesis}
              family={family}
              action={thesis.status === "draft"
                ? { label: "Review and confirm view", onClick: () => setReviewingConfirmation(true) }
                : { label: "Build a basket", href: `/theses/${id}/build` }}
            />
          </aside>
        </div>
      ) : null}
      <Card className="space-y-3">
        <div>
          <h2 className="font-serif text-xl">Your view</h2>
          <p className="mt-1 text-sm text-muted">Edit the conditions that would support your idea. Save creates a draft version; confirm only after reviewing the wording.</p>
        </div>
        <Field label="Template">
          <select className={inputCls()} value={thesis.template} onChange={(event) => change("template", event.target.value as ThesisRevision["template"])}>
            <option value="directional">Directional</option>
            <option value="range">Range</option>
            <option value="outside">Outside range</option>
            <option value="stepped">Stepped</option>
          </select>
        </Field>
        {thesis.template === "directional" ? (
          <Field label="Direction">
            <select className={inputCls()} value={thesis.direction || "yes"} onChange={(event) => change("direction", event.target.value as "yes" | "no")}>
              <option value="yes">Pays at or above the threshold</option>
              <option value="no">Pays below the threshold</option>
            </select>
          </Field>
        ) : null}
        <Field label="Lower / directional threshold">
          <input className={inputCls()} type="number" value={thesis.lowerThreshold ?? ""} onChange={(event) => change("lowerThreshold", event.target.value === "" ? null : Number(event.target.value))} />
        </Field>
        {thesis.template !== "directional" ? (
          <Field label="Upper threshold">
            <input className={inputCls()} type="number" value={thesis.upperThreshold ?? ""} onChange={(event) => change("upperThreshold", event.target.value === "" ? null : Number(event.target.value))} />
          </Field>
        ) : null}
        <Field label="Rationale">
          <textarea className={`${inputCls()} min-h-24 py-2`} maxLength={4_000} value={thesis.rationale} onChange={(event) => change("rationale", event.target.value)} />
        </Field>
        <Field label="I would reconsider if">
          <textarea className={`${inputCls()} min-h-20 py-2`} maxLength={2_000} value={thesis.invalidation} onChange={(event) => change("invalidation", event.target.value)} />
        </Field>
      </Card>
      {reviewingConfirmation ? (
        <Card className="space-y-3">
          <h2 className="font-serif text-xl">Review this view</h2>
          <p className="text-sm">{thesis.template === "directional" ? `${thesis.direction?.toUpperCase() || "YES"} at ${thesis.lowerThreshold ?? "an unset threshold"}` : `${thesis.template} from ${thesis.lowerThreshold ?? "an unset lower bound"} to ${thesis.upperThreshold ?? "an unset upper bound"}`}</p>
          <p className="text-xs text-muted">Confirming versions this view and opens payoff design. It does not request a quote, approve USDC, or submit a transaction.</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void save("confirm")} disabled={saving !== null}>{saving === "confirm" ? "Confirming…" : "Confirm view and open payoff design"}</Button>
            <Button onClick={() => setReviewingConfirmation(false)} kind="ghost" disabled={saving !== null}>Cancel</Button>
          </div>
        </Card>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void save("save")} disabled={saving !== null}>{saving === "save" ? "Saving…" : "Save view"}</Button>
        <Button onClick={() => setReviewingConfirmation(true)} disabled={saving !== null || !dirty && thesis.status === "confirmed"}>Review confirmation</Button>
        <Button onClick={() => void save("duplicate")} kind="secondary" disabled={saving !== null}>{saving === "duplicate" ? "Creating copy…" : "Duplicate as draft"}</Button>
        <Button onClick={openHistory} kind="ghost">History</Button>
        <Button onClick={backToWorkspace} kind="ghost">Back to workspace</Button>
      </div>
    </div>
  );
}
