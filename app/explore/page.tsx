"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, modeFromStorage } from "@/lib/client";
import type { MarketFamily } from "@/lib/domain/types";
import { Button, Card, Empty, inputCls } from "@/components/ui";
import { formatTime } from "@/lib/format";
import { useModeChange } from "@/lib/use-mode-change";

type Watchlist = { id: string; name: string; slugs: string[] };

export default function Explore() {
  const [q, setQ] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [data, setData] = useState<{ families: MarketFamily[]; freshnessLabel: string; liveError: string | null } | null>(null);
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [error, setError] = useState("");
  const [watchError, setWatchError] = useState("");
  const [notice, setNotice] = useState("");
  const [watchingSlug, setWatchingSlug] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (query = submittedQuery) => {
    const mode = modeFromStorage() === "live" ? "live" : "replay";
    setLoading(true);
    setError("");
    try {
      const result = await api<{ families: MarketFamily[]; freshnessLabel: string; liveError: string | null }>(`/api/topics?mode=${mode}&q=${encodeURIComponent(query)}`);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Markets could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [submittedQuery]);

  useModeChange(() => { void load(); });

  useEffect(() => {
    void load("");
    api<{ watchlists: Watchlist[] }>("/api/watchlists").then((result) => setWatchlists(result.watchlists || [])).catch(() => setWatchlists([]));
    // The first query is the empty explore feed. Search is submitted explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggleWatch(family: MarketFamily) {
    setWatchingSlug(family.slug);
    setWatchError("");
    setNotice("");
    try {
      const existing = watchlists.find((list) => list.slugs.includes(family.slug));
      if (existing) {
        const slugs = existing.slugs.filter((slug) => slug !== family.slug);
        const result = await api<{ watchlist: Watchlist }>(`/api/watchlists/${existing.id}`, { method: "PATCH", body: JSON.stringify({ slugs }) });
        setWatchlists((lists) => lists.map((list) => list.id === existing.id ? result.watchlist : list));
        setNotice(`Removed ${family.title} from ${existing.name}.`);
      } else if (watchlists.length) {
        const list = watchlists[0];
        const result = await api<{ watchlist: Watchlist }>(`/api/watchlists/${list.id}`, { method: "PATCH", body: JSON.stringify({ slugs: [...new Set([...list.slugs, family.slug])] }) });
        setWatchlists((lists) => lists.map((item) => item.id === list.id ? result.watchlist : item));
        setNotice(`Added ${family.title} to ${list.name}.`);
      } else {
        const result = await api<{ watchlist: Watchlist }>("/api/watchlists", { method: "POST", body: JSON.stringify({ name: "Research topics", slugs: [family.slug] }) });
        setWatchlists((lists) => [result.watchlist, ...lists]);
        setNotice(`Created a Research topics list and added ${family.title}.`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Watchlist could not be updated.";
      setWatchError(message.toLowerCase().includes("sign in") || message.toLowerCase().includes("auth")
        ? "Sign in to save watched topics. Your research remains available without an account."
        : message);
    } finally {
      setWatchingSlug("");
    }
  }

  const movements = useMemo(() => (data?.families || []).flatMap((family) => family.contracts.flatMap((contract) => {
    const points = (contract.priceHistory || []).map((point) => ({ time: Date.parse(point.timestamp), price: Number(point.price) })).filter((point) => Number.isFinite(point.time) && Number.isFinite(point.price));
    if (points.length < 2) return [];
    points.sort((a, b) => a.time - b.time);
    const first = points[0];
    const latest = points[points.length - 1];
    return [{ family, contract, change: latest.price - first.price, firstAt: first.time, latestAt: latest.time }];
  })).sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, 3), [data]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-serif text-3xl">Explore</h1>
        <p className="mt-1 text-sm text-muted">Start with a question. Research stays open without a wallet or funding.</p>
      </div>
      <form className="flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); setSubmittedQuery(q.trim()); void load(q.trim()); }}>
        <input className={`${inputCls()} min-w-56 flex-1`} value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search markets or topics" aria-label="Search markets or topics" />
        <Button type="submit" disabled={loading}>{loading ? "Searching…" : "Search"}</Button>
        <Button href="/gemini" kind="ghost">All Gemini markets</Button>
      </form>
      {data ? <p className="text-xs text-muted">{data.freshnessLabel}</p> : null}
      {data?.liveError ? <p role="status" className="rounded-lg border border-bad/30 bg-white p-3 text-sm text-bad">{data.liveError}. Switch to Replay to inspect the labeled walkthrough data.</p> : null}
      {notice ? <p role="status" className="rounded-lg border border-line bg-white p-3 text-sm text-muted">{notice}</p> : null}
      {watchError ? <p role="alert" className="rounded-lg border border-bad/30 bg-white p-3 text-sm text-bad">{watchError} <Link className="text-action underline" href="/auth">Sign in</Link></p> : null}

      {watchlists.some((list) => list.slugs.length) ? (
        <Card>
          <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="font-serif text-xl">Watched topics</h2><Link href="/watchlists" className="text-sm text-action">Manage lists</Link></div>
          <div className="mt-3 flex flex-wrap gap-2">
            {watchlists.flatMap((list) => list.slugs.map((slug) => ({ list, slug }))).map(({ list, slug }) => {
              const family = data?.families.find((item) => item.slug === slug);
              return <Link key={`${list.id}-${slug}`} href={`/topics/${slug}`} className="rounded-full border border-line px-3 py-2 text-sm hover:border-action">{family?.title || slug.replaceAll("-", " ")} <span className="text-xs text-muted">· {list.name}</span></Link>;
            })}
          </div>
        </Card>
      ) : null}

      {movements.length ? (
        <Card>
          <h2 className="font-serif text-xl">Meaningful market movements</h2>
          <p className="mt-1 text-xs text-muted">Change in Gemini YES reference price over the returned history window. This is not a probability forecast.{data?.families.some((family) => family.mode === "replay") ? " Replay movement points are demonstration data, not Gemini history." : ""}</p>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {movements.map(({ family, contract, change, firstAt, latestAt }) => (
              <Link key={contract.id} href={`/topics/${family.slug}`} className="rounded-lg border border-line p-3 hover:border-action">
                <p className="text-xs text-muted">{family.title}</p><p className="mt-1 font-medium">{contract.label}</p>
                <p className={`mt-2 text-lg font-semibold ${change >= 0 ? "text-good" : "text-bad"}`}>{change >= 0 ? "+" : ""}{(change * 100).toFixed(1)}¢</p>
                <p className="text-xs text-muted">{new Date(firstAt).toLocaleDateString()} – {new Date(latestAt).toLocaleDateString()}</p>
              </Link>
            ))}
          </div>
        </Card>
      ) : null}

      {loading && !data ? <p role="status">Loading Gemini markets…</p> : null}
      {error ? <p role="alert" className="text-sm text-bad">{error}</p> : null}
      {data && !loading && !data.families.length ? <Empty title={submittedQuery ? "No matching markets" : "No compatible Gemini markets"}>{submittedQuery ? "Try another question or clear your search." : "No supported market families were returned in this mode. You can browse the full Gemini catalog for other listed markets."}</Empty> : null}
      <div className="grid gap-3">
        {data?.families.map((family) => {
          const watched = watchlists.some((list) => list.slugs.includes(family.slug));
          return (
            <Card key={family.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link href={`/topics/${family.slug}`} className="font-serif text-xl">{family.title}</Link>
                  <p className="mt-1 text-sm text-muted">{family.question}</p>
                  <p className="mt-2 text-xs text-muted">{family.predicates.length === 1 ? "1 selected Gemini contract" : `${family.predicates.length} verified Gemini contracts`} · observes {formatTime(family.observationTime)} · {family.freshness}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => void toggleWatch(family)} kind="ghost" disabled={watchingSlug === family.slug}>{watchingSlug === family.slug ? "Saving…" : watched ? "Remove from watchlist" : "Watch topic"}</Button>
                  <Button href={`/topics/${family.slug}`}>Open research</Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
