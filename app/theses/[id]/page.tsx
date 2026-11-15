"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, modeFromStorage } from "@/lib/client";
import type { EvidenceItem, MarketFamily, ThesisRevision } from "@/lib/domain/types";
import { VoicePanel } from "@/components/VoicePanel";
import { Button, Card, Empty, Field, inputCls } from "@/components/ui";

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

  return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl">My view</h1>
      <p className="text-sm text-muted">Revision {thesis.revision} · {thesis.status}. Save creates a version. Confirm opens a payoff review before any quote or transaction.</p>
      {error ? <p role="alert" className="rounded-lg border border-bad/30 bg-white p-3 text-sm text-bad">{error}</p> : null}
      {notice ? <p role="status" className="rounded-lg border border-line bg-white p-3 text-sm text-muted">{notice}</p> : null}
      <Card className="space-y-3">
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
      {family ? (
        <VoicePanel
          slug={family.slug}
          family={family}
          evidence={evidence}
          thesis={thesis}
          onThesisChange={(updated) => { setThesis(updated); setDirty(false); setNotice(`Voice-assisted edit saved as draft revision ${updated.revision}.`); }}
          context="view"
        />
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
