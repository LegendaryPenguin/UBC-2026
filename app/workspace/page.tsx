"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { ThesisRevision } from "@/lib/domain/types";
import { Button, Card, Empty } from "@/components/ui";

type ThesisFilter = "all" | ThesisRevision["status"];

export default function Workspace() {
  const [theses, setTheses] = useState<ThesisRevision[]>([]);
  const [filter, setFilter] = useState<ThesisFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api<{ theses: ThesisRevision[] }>("/api/theses")
      .then((r) => { if (active) setTheses(r.theses || []); })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : "Saved theses could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const rows = theses.filter((thesis) => filter === "all" || thesis.status === filter);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-3xl">My Theses</h1>
        <p className="mt-1 text-sm text-muted">Resume a view, follow its history, or keep researching without turning it into a trade.</p>
      </div>
      {error ? <p role="alert" className="rounded-lg border border-bad/30 bg-white p-3 text-sm text-bad">{error}</p> : null}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter theses">
        {(["all", "draft", "confirmed", "quoted"] as ThesisFilter[]).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={filter === value}
            className={`min-h-11 rounded-lg border px-3 capitalize ${filter === value ? "border-action bg-[#E9EEFF] font-medium text-action" : "border-line text-muted"}`}
            onClick={() => setFilter(value)}
          >
            {value === "all" ? "All theses" : value}
          </button>
        ))}
      </div>
      {loading ? <p role="status" className="text-sm text-muted">Loading your theses…</p> : null}
      {!loading && !error && rows.length === 0 ? (
        <Empty title={filter === "all" ? "No saved theses yet" : `No ${filter} theses`}>
          Start with a question in Explore. A saved thesis stays useful even if you never build or place a trade.
          <span className="mt-3 block"><Button href="/explore">Explore questions</Button></span>
        </Empty>
      ) : null}
      {rows.map((t) => (
        <Card key={t.id} className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-serif text-xl">{t.topicSlug.replaceAll("-", " ")}</p>
              <p className="text-sm capitalize text-muted">{t.status} · {t.template} view · revision {t.revision}</p>
              <p className="text-xs text-muted">Updated {new Date(t.updatedAt).toLocaleString()}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button href={`/theses/${t.id}`}>{t.status === "draft" ? "Resume research" : "Open thesis"}</Button>
              <Button href={`/theses/${t.id}/history`} kind="ghost">History</Button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
