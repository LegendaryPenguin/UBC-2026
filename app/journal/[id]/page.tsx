"use client";

import { useParams } from "next/navigation";
import { Button, Card, Field, inputCls } from "@/components/ui";
import { useState } from "react";

export default function JournalDetail() {
  const { id } = useParams<{ id: string }>();
  const [note, setNote] = useState("");
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl">Decision review</h1>
      <Card>
        <p className="text-sm">Snapshot for {id}. Compare the scenario that paid with the view you confirmed. Calibration charts appear only after enough explicit probabilities exist.</p>
        <Field label="Private reflection">
          <textarea className={`${inputCls()} min-h-24 py-2`} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <Button onClick={() => alert("Saved locally for this session.")}>Write reflection</Button>
      </Card>
    </div>
  );
}
