"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { Empty } from "@/components/ui";

export default function Activity() {
  const [rows, setRows] = useState<{ id: string; type: string; status: string; hash: string | null; amount: string }[]>([]);
  useEffect(() => {
    api<{ transactions: typeof rows }>("/api/activity").then((r) => setRows(r.transactions || []));
  }, []);
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl">Activity</h1>
      {rows.length === 0 ? <Empty title="No ledger yet">Financial results live here, not only in toasts.</Empty> : null}
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
