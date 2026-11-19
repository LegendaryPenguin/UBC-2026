"use client";

import { useParams } from "next/navigation";
import { api } from "@/lib/client";
import { Button, Card } from "@/components/ui";
import { useState } from "react";

export default function ExitPage() {
  const { id } = useParams<{ id: string }>();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl">Exit</h1>
      <Card>
        <p className="text-sm">An exit is a separate funded buyback. Partial splits are unavailable until the escrow split model is deployed. There is no “exit anytime” promise.</p>
        {error ? <p role="alert" className="mt-3 rounded-lg border border-bad/30 bg-[#FFF5F4] p-3 text-sm text-bad">{error}</p> : null}
        <div className="mt-4 flex gap-2">
          <Button
            disabled={pending}
            onClick={async () => {
              setPending(true);
              setError("");
              try {
                await api(`/api/positions/${id}`, { method: "PATCH", body: JSON.stringify({ action: "exit" }) });
                window.location.href = `/positions/${id}`;
              } catch (err) {
                setError(err instanceof Error ? err.message : "No exit liquidity");
                setPending(false);
              }
            }}
          >
            {pending ? "Requesting…" : "Request exit quote"}
          </Button>
          <Button href={`/positions/${id}`} kind="ghost">Keep holding</Button>
        </div>
      </Card>
    </div>
  );
}
