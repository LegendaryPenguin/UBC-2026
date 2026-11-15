"use client";

import { useParams } from "next/navigation";
import { Button, Card } from "@/components/ui";

export default function TxPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl">Transaction</h1>
      <Card>
        <p className="font-mono text-sm">{id}</p>
        <p className="mt-2 text-sm">Unknown status is never auto-resubmitted. Refresh reads status only.</p>
        <div className="mt-3 flex gap-2">
          <Button href="/activity">Back to ledger</Button>
          <Button href="/support" kind="ghost">Contact support</Button>
        </div>
      </Card>
    </div>
  );
}
