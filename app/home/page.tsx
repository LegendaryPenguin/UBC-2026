"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Button, Card, Empty } from "@/components/ui";

export default function HomePage() {
  const [theses, setTheses] = useState<{ id: string; topicSlug: string; status: string }[]>([]);
  const [positions, setPositions] = useState<{ id: string; status: string; premium: string }[]>([]);
  useEffect(() => {
    api<{ theses: typeof theses }>("/api/theses").then((r) => setTheses(r.theses || []));
    api<{ positions: typeof positions }>("/api/positions").then((r) => setPositions(r.positions || []));
  }, []);
  const claims = positions.filter((p) => p.status === "resolved" || p.status === "voided");
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl">Home</h1>
      {claims.length ? (
        <Card>
          <h2 className="font-serif text-xl">Action required</h2>
          {claims.map((c) => (
            <div key={c.id} className="mt-2 flex items-center justify-between">
              <span>Position {c.id} is {c.status}</span>
              <Button href={`/positions/${c.id}`}>Claim</Button>
            </div>
          ))}
        </Card>
      ) : null}
      <Card>
        <h2 className="font-serif text-xl">Recent work</h2>
        {theses.length === 0 ? <p className="mt-2 text-sm text-muted">No drafts yet. Start with a sample topic.</p> : null}
        {theses.map((t) => (
          <div key={t.id} className="mt-2 flex items-center justify-between text-sm">
            <span>{t.topicSlug} · {t.status}</span>
            <Button href={`/theses/${t.id}`} kind="ghost">Resume</Button>
          </div>
        ))}
      </Card>
      {theses.length === 0 && positions.length === 0 ? (
        <Empty title="First research journey">
          Open the recorded BTC November 20 family, confirm a range, and inspect why a YES ticket is a different payoff.
          <div className="mt-3"><Button href="/explore">Browse topics</Button></div>
        </Empty>
      ) : null}
    </div>
  );
}
