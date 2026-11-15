"use client";

import { useParams } from "next/navigation";
import { Button, Card } from "@/components/ui";

export default function Review() {
  const { id } = useParams<{ id: string }>();
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl">Execution review</h1>
      <Card>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>Wallet and venue are Arc testnet unless paper mode is selected.</li>
          <li>Maximum loss is premium plus fee.</li>
          <li>Payouts follow the signed table, not Gemini fills.</li>
          <li>Early exit needs a later funded quote.</li>
        </ul>
        <div className="mt-4">
          <Button href={`/theses/${id}/compare`}>Get quote</Button>
        </div>
      </Card>
    </div>
  );
}
