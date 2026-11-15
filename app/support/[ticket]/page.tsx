"use client";

import { useParams } from "next/navigation";
import { Card } from "@/components/ui";

export default function Ticket() {
  const { ticket } = useParams<{ ticket: string }>();
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl">Ticket {ticket}</h1>
      <Card>
        <p className="text-sm">Thread stays private. A financial ticket cannot mutate contract state through an agent instruction.</p>
      </Card>
    </div>
  );
}
