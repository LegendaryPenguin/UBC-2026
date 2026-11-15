"use client";

import { useParams } from "next/navigation";
import { api } from "@/lib/client";
import { Button, Card } from "@/components/ui";

export default function ExitPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl">Exit</h1>
      <Card>
        <p className="text-sm">An exit is a separate funded buyback. Partial splits are unavailable until the escrow split model is deployed. There is no “exit anytime” promise.</p>
        <div className="mt-4 flex gap-2">
          <Button
            onClick={async () => {
              try {
                await api(`/api/positions/${id}`, { method: "PATCH", body: JSON.stringify({ action: "exit" }) });
                window.location.href = `/positions/${id}`;
              } catch (err) {
                alert(err instanceof Error ? err.message : "No exit liquidity");
              }
            }}
          >
            Request exit quote
          </Button>
          <Button href={`/positions/${id}`} kind="ghost">Keep holding</Button>
        </div>
      </Card>
    </div>
  );
}
