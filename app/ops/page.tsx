"use client";

import { useState } from "react";
import { Button, Card, Field, inputCls } from "@/components/ui";
import { api } from "@/lib/client";

type Report = {
  action: string;
  scenarioIndex: number | null;
  scenarioLabel: string | null;
  evidenceHash: string | null;
  createdAt: string;
  transactionHash: string | null;
};
type OpsPosition = {
  id: string;
  chainPositionId: string | null;
  topicSlug: string;
  status: string;
  longstop: number;
  finalizationDelay: number;
  labels: string[];
  latestReport: Report | null;
};

export default function Ops() {
  const [secret, setSecret] = useState("");
  const [positions, setPositions] = useState<OpsPosition[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);
  const headers = { "x-operator": secret };

  async function refresh() {
    setWorking(true);
    setError("");
    try {
      const result = await api<{ positions: OpsPosition[] }>("/api/ops/settle", { headers });
      setPositions(result.positions);
    } catch (err) {
      setPositions([]);
      setError(err instanceof Error ? err.message : "Operations data could not be loaded.");
    } finally {
      setWorking(false);
    }
  }

  async function act(positionId: string, action: "propose" | "finalize" | "void") {
    setWorking(true);
    setError("");
    setMessage("");
    try {
      const result = await api<{ pending?: boolean; transactionHash?: string; proposal?: { scenarioIndex: number; finalizesAt: number }; status?: string }>(
        "/api/ops/settle", { method: "POST", headers, body: JSON.stringify({ positionId, action }) },
      );
      if (result.pending) setMessage(`Transaction ${result.transactionHash} may still be confirming. Check the chain before retrying.`);
      else if (result.proposal) setMessage(`Proposal recorded. Anyone can finalize after ${new Date(result.proposal.finalizesAt * 1000).toISOString()} if Gemini's result is unchanged.`);
      else if (result.status === "resolved") setMessage("The source-backed result is finalized on Arc.");
      else if (result.status === "voided") setMessage("The longstop refund is recorded on Arc.");
      else setMessage("Operation confirmed.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The operation could not be completed.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl">Operations</h1>
      <Card className="space-y-3">
        <p className="text-sm">Gemini's final contract results are fetched and mapped to the signed payout schedule. Arc enforces the one hour correction window and immutable longstop; its hash records evidence but does not prove Gemini's data is truthful.</p>
        <Field label="Operator secret">
          <input className={inputCls()} type="password" autoComplete="current-password" value={secret} onChange={(event) => setSecret(event.target.value)} />
        </Field>
        <Button onClick={() => void refresh()} disabled={!secret || working}>{working ? "Loading…" : "Load open positions"}</Button>
      </Card>
      {error ? <p role="alert" className="rounded-lg border border-bad/30 bg-white p-3 text-sm text-bad">{error}</p> : null}
      {message ? <p role="status" className="rounded-lg border border-line bg-white p-3 text-sm">{message}</p> : null}
      {positions.length === 0 && secret && !error ? <Card><p className="text-sm text-muted">No open Arc positions are recorded for settlement operations.</p></Card> : null}
      {positions.map((position) => (
        <Card key={position.id} className="space-y-3">
          <div>
            <h2 className="font-serif text-xl">{position.topicSlug}</h2>
            <p className="text-xs text-muted">Local {position.id} · Arc position #{position.chainPositionId} · {position.status}</p>
          </div>
          <p className="text-sm">Refund longstop: {new Date(position.longstop * 1000).toISOString()} · correction delay: {Math.ceil(position.finalizationDelay / 3600)} hour</p>
          {position.latestReport ? (
            <p className="break-all text-xs text-muted">Latest report: {position.latestReport.action}{position.latestReport.scenarioLabel ? ` · ${position.latestReport.scenarioLabel}` : ""}{position.latestReport.evidenceHash ? ` · evidence ${position.latestReport.evidenceHash}` : ""}</p>
          ) : <p className="text-xs text-muted">No settlement report has been proposed.</p>}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void act(position.id, "propose")} disabled={working}>Fetch Gemini result and propose</Button>
            <Button kind="secondary" onClick={() => void act(position.id, "finalize")} disabled={working}>Finalize after delay</Button>
            <Button kind="ghost" onClick={() => void act(position.id, "void")} disabled={working}>Void at longstop</Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
