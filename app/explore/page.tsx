"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, modeFromStorage } from "@/lib/client";
import type { MarketFamily } from "@/lib/domain/types";
import { Button, Card, Empty, Field, inputCls } from "@/components/ui";
import { formatTime } from "@/lib/format";

export default function Explore() {
  const [q, setQ] = useState("");
  const [data, setData] = useState<{ families: MarketFamily[]; freshnessLabel: string; liveError: string | null } | null>(null);
  const [error, setError] = useState("");
  async function load() {
    const mode = modeFromStorage() === "live" ? "live" : "replay";
    try {
      const res = await api<typeof data>(`/api/topics?mode=${mode}&q=${encodeURIComponent(q)}`);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    }
  }
  useEffect(() => {
    load();
  }, []);
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl">Explore</h1>
      <p className="text-sm text-muted">{data?.freshnessLabel}</p>
      {data?.liveError ? <p className="text-sm text-bad">{data.liveError}. Use replay mode for the recorded walkthrough.</p> : null}
      <div className="flex gap-2">
        <input className={inputCls()} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search topics" />
        <Button onClick={load}>Search</Button>
        <Button href="/gemini" kind="ghost">Gemini markets</Button>
        <Button href="/calendar" kind="ghost">Calendar</Button>
      </div>
      {!data ? <p>Loading topics…</p> : null}
      {data && data.families.length === 0 ? (
        <Empty title="No compatible families">
          Compatible families need ordered thresholds on the same observation. <Link href="/help/families">Why a family can be unsupported</Link>
        </Empty>
      ) : null}
      <div className="grid gap-3">
        {data?.families.map((f) => (
          <Card key={f.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <Link href={`/topics/${f.slug}`} className="font-serif text-xl">{f.title}</Link>
                <p className="text-sm text-muted">{f.predicates.length} thresholds · {f.mode} · {f.sourceEvent.status}</p>
                <p className="text-xs text-muted">Observation {formatTime(f.observationTime)}</p>
              </div>
              <Button href={`/topics/${f.slug}`}>Open topic</Button>
            </div>
          </Card>
        ))}
      </div>
      {error ? <p className="text-bad">{error}</p> : null}
      <Field label="Suggest a market" hint="This is a curation request, not a listing promise.">
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.target as HTMLFormElement;
            const url = (form.elements.namedItem("url") as HTMLInputElement).value;
            await api("/api/support", { method: "POST", body: JSON.stringify({ category: "curation", text: url }) }).catch(() => null);
            alert("Request saved if you are signed in.");
          }}
        >
          <input name="url" className={inputCls()} placeholder="Source URL" />
          <Button type="submit" kind="secondary">Suggest</Button>
        </form>
      </Field>
    </div>
  );
}
