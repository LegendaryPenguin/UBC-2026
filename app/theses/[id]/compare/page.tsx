"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, modeFromStorage } from "@/lib/client";
import type { SignedQuote, ThesisRevision } from "@/lib/domain/types";
import { formatUsdc } from "@/lib/format";
import { Button, Card, Field, inputCls } from "@/components/ui";
import { useAccount } from "wagmi";

export default function ComparePage() {
  const { id } = useParams<{ id: string }>();
  const { address } = useAccount();
  const [thesis, setThesis] = useState<ThesisRevision | null>(null);
  const [budget, setBudget] = useState("100");
  const [quote, setQuote] = useState<SignedQuote | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  useEffect(() => {
    setBudget(new URLSearchParams(window.location.search).get("maxPayout") || "100");
    api<{ thesis: ThesisRevision }>(`/api/theses/${id}`).then((r) => setThesis(r.thesis)).catch((err) => setError(err.message));
  }, [id]);
  async function requestQuote() {
    setPending(true);
    setError("");
    setQuote(null);
    setNote("");
    try {
      const mode = modeFromStorage();
      const res = await api<{ quote: SignedQuote; note: string }>("/api/quotes", {
        method: "POST",
        body: JSON.stringify({ thesisId: id, mode, maxPayout: budget, taker: address }),
      });
      setQuote(res.quote);
      setNote(res.note);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Quote failed");
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl">Compare</h1>
      <p className="text-sm text-muted">Custom Arc offers are listed beside native Gemini constructions. A cheaper different payoff is not labeled best.</p>
      <Field label="Maximum payout">
        <input className={inputCls()} value={budget} onChange={(e) => setBudget(e.target.value)} />
      </Field>
      <Button onClick={requestQuote} disabled={pending || !thesis}>{pending ? "Requesting…" : "Request quotes"}</Button>
      {note ? <p className="text-sm text-muted">{note}</p> : null}
      {error ? <p className="text-bad text-sm">{error}</p> : null}
      {quote ? (
        <Card>
          <h2 className="font-serif text-xl">{quote.signature === "0x" ? "Simulated quote" : "Arc maker offer"}</h2>
          <ul className="mt-2 text-sm">
            <li>Status: {quote.status}</li>
            <li>Premium: {formatUsdc(BigInt(quote.premium))} USDC</li>
            <li>Fee: {formatUsdc(BigInt(quote.fee))} USDC</li>
            <li>Max payout: {formatUsdc(BigInt(quote.maxPayout))} USDC</li>
            <li>Expires: {new Date(quote.deadline * 1000).toLocaleString()}</li>
          </ul>
          {quote.unavailableReason ? <p className="mt-2 text-sm text-bad">{quote.unavailableReason}</p> : null}
          <div className="mt-3">
            <Button href={`/quotes/${quote.id}`}>Inspect terms</Button>
          </div>
        </Card>
      ) : (
        <Card>
          <p className="text-sm">No firm quote yet. Native Gemini multi-leg orders stay gated until exchange trading is qualified.</p>
        </Card>
      )}
    </div>
  );
}
