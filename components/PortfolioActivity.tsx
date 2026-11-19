"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { Empty } from "@/components/ui";

export function PortfolioActivity({ embedded = false }: { embedded?: boolean }) {
  const [rows, setRows] = useState<{ id: string; type: string; status: string; hash: string | null; amount: string }[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api<{ transactions: typeof rows }>("/api/activity").then((r) => { if (active) setRows(r.transactions || []); })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : "Activity could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retryCount]);
  return (
    <div className="space-y-4">
      {embedded ? <h2 className="font-serif text-2xl">Activity</h2> : <h1 className="font-serif text-3xl">Activity</h1>}
      {loading ? <p role="status" className="text-sm text-muted">Loading account activity…</p> : null}
      {error ? <p role="alert" className="rounded-lg border border-bad/30 bg-white p-3 text-sm text-bad">{error} <button className="ml-2 text-action underline" onClick={() => setRetryCount((count) => count + 1)}>Retry</button></p> : null}
      {!loading && !error && rows.length === 0 ? <Empty title="No ledger yet">Financial results live here, not only in toasts.</Empty> : null}
      <table className="w-full text-left text-sm">
        <thead>
          <tr><th>Type</th><th>Status</th><th>Amount</th><th></th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-line">
              <td className="py-2">{r.type}</td>
              <td>{r.status}</td>
              <td>{r.amount}</td>
              <td><Link href={`/transactions/${r.id}`}>Receipt</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
