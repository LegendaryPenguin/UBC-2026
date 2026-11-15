"use client";

import { useParams } from "next/navigation";
import { api } from "@/lib/client";
import { Button, Card } from "@/components/ui";
import { useState } from "react";

export default function Publish() {
  const { id } = useParams<{ id: string }>();
  const [token, setToken] = useState("");
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl">Publish snapshot</h1>
      <Card>
        <p className="text-sm">Default public fields exclude wallet, balances, private notes, and positions. Copy link does not publish.</p>
        <Button
          onClick={async () => {
            const res = await api<{ publication: { token: string } }>("/api/publish", {
              method: "POST",
              body: JSON.stringify({ thesisId: id, includeRationale: false, access: "unlisted" }),
            });
            setToken(res.publication.token);
          }}
        >
          Confirm publication
        </Button>
        {token ? <p className="mt-2 text-sm">Link: /shared/{token}</p> : null}
      </Card>
    </div>
  );
}
