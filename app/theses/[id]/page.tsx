"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/client";
import type { ThesisRevision } from "@/lib/domain/types";
import { Button, Card, Field, inputCls } from "@/components/ui";

export default function ThesisEditor() {
  const { id } = useParams<{ id: string }>();
  const [thesis, setThesis] = useState<ThesisRevision | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<{ thesis: ThesisRevision }>(`/api/theses/${id}`).then((r) => setThesis(r.thesis)).catch((e) => setError(e.message));
  }, [id]);
  async function save(action?: string) {
    if (!thesis) return;
    const res = await api<{ thesis: ThesisRevision }>(`/api/theses/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ ...thesis, action }),
    });
    setThesis(res.thesis);
    if (action === "confirm") window.location.href = `/theses/${id}/build`;
  }
  if (error) return <p className="text-bad">{error}</p>;
  if (!thesis) return <p>Loading thesis…</p>;
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl">My view</h1>
      <p className="text-sm text-muted">Revision {thesis.revision} · {thesis.status}. Confirming creates an immutable version for payoff design.</p>
      <Card className="space-y-3">
        <Field label="Template">
          <select className={inputCls()} value={thesis.template} onChange={(e) => setThesis({ ...thesis, template: e.target.value as ThesisRevision["template"] })}>
            <option value="directional">Directional</option>
            <option value="range">Range</option>
            <option value="outside">Outside range</option>
            <option value="stepped">Stepped</option>
          </select>
        </Field>
        {thesis.template === "directional" ? (
          <Field label="Direction">
            <select className={inputCls()} value={thesis.direction || "yes"} onChange={(e) => setThesis({ ...thesis, direction: e.target.value as "yes" | "no" })}>
              <option value="yes">Pays if at or above the threshold</option>
              <option value="no">Pays if below the threshold</option>
            </select>
          </Field>
        ) : null}
        <Field label="Lower / directional threshold">
          <input className={inputCls()} type="number" value={thesis.lowerThreshold ?? ""} onChange={(e) => setThesis({ ...thesis, lowerThreshold: e.target.value === "" ? null : Number(e.target.value) })} />
        </Field>
        <Field label="Upper threshold">
          <input className={inputCls()} type="number" value={thesis.upperThreshold ?? ""} onChange={(e) => setThesis({ ...thesis, upperThreshold: e.target.value === "" ? null : Number(e.target.value) })} />
        </Field>
        <Field label="Rationale">
          <textarea className={`${inputCls()} min-h-24 py-2`} value={thesis.rationale} onChange={(e) => setThesis({ ...thesis, rationale: e.target.value })} />
        </Field>
        <Field label="I would reconsider if">
          <textarea className={`${inputCls()} min-h-20 py-2`} value={thesis.invalidation} onChange={(e) => setThesis({ ...thesis, invalidation: e.target.value })} />
        </Field>
      </Card>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => save()}>Save</Button>
        <Button onClick={() => save("confirm")}>Confirm this view</Button>
        <Button href={`/theses/${id}/history`} kind="ghost">History</Button>
        <Button kind="ghost" onClick={() => save("duplicate")}>Duplicate</Button>
      </div>
    </div>
  );
}
