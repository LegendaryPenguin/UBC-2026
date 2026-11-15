"use client";

import { api } from "@/lib/client";
import { Button, Card } from "@/components/ui";

export default function Reports() {
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl">Reports</h1>
      <Card>
        <p className="text-sm">These are accounting records, not tax advice. CSV amounts include currency and precision.</p>
        <Button
          onClick={async () => {
            const res = await api<{ job: { id: string } }>("/api/reports", { method: "POST", body: JSON.stringify({ kind: "ledger" }) });
            alert(`Export ${res.job.id} ready`);
          }}
        >
          Generate ledger
        </Button>
      </Card>
    </div>
  );
}
