"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { api, modeFromStorage } from "@/lib/client";
import type { MarketFamily, ThesisRevision } from "@/lib/domain/types";
import { compileView } from "@/lib/payoffs/compile";
import { buildComparisons } from "@/lib/payoffs/compare";
import { parseUsdc } from "@/lib/format";
import { PayoffChart } from "@/components/PayoffChart";
import { Button, Card, Field, inputCls } from "@/components/ui";
import { VoicePanel } from "@/components/VoicePanel";
import { evidenceForSlug } from "@/lib/evidence";

export default function BuildPage() {
  const { id } = useParams<{ id: string }>();
  const [thesis, setThesis] = useState<ThesisRevision | null>(null);
  const [family, setFamily] = useState<MarketFamily | null>(null);
  const [max, setMax] = useState("100");
  const [error, setError] = useState("");
  useEffect(() => {
    api<{ thesis: ThesisRevision }>(`/api/theses/${id}`).then(async (r) => {
      setThesis(r.thesis);
      const mode = modeFromStorage() === "live" ? "live" : "replay";
      const t = await api<{ family: MarketFamily }>(`/api/topics/${r.thesis.topicSlug}?mode=${mode}`);
      setFamily(t.family);
    }).catch((e) => setError(e.message));
  }, [id]);
  const set = useMemo(() => {
    if (!thesis || !family) return null;
    try {
      const custom = compileView(
        family,
        thesis.template,
        { threshold: thesis.lowerThreshold, direction: thesis.direction, lower: thesis.lowerThreshold, upper: thesis.upperThreshold },
        parseUsdc(max || "100"),
      );
      return buildComparisons(family, custom, { lower: thesis.lowerThreshold, upper: thesis.upperThreshold, threshold: thesis.lowerThreshold, direction: thesis.direction });
    } catch (err) {
      return { error: err instanceof Error ? err.message : "compile" };
    }
  }, [thesis, family, max]);
  if (error) return <p className="text-bad">{error}</p>;
  if (!set) return <p>Loading payoff studio…</p>;
  const comparisons = "custom" in set ? set : null;
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl">Payoff studio</h1>
      <Field label="Maximum payout (USDC)" hint="This is the most the position can pay, fully locked by the maker.">
        <input className={inputCls()} value={max} onChange={(e) => setMax(e.target.value)} />
      </Field>
      {"error" in set ? <p role="alert" className="text-bad">{set.error}</p> : null}
      {comparisons ? <Card>
        <p className="text-sm text-muted">Shaded mismatch: a lower YES ticket still pays above your upper bound. The custom column does not.</p>
        <PayoffChart
          labels={comparisons.custom.rows.map((r) => r.label)}
          series={[
            { name: "Custom", values: comparisons.custom.rows.map((r) => r.payout), color: "#3559E0" },
            ...(comparisons.ticket ? [{ name: "Single ticket", values: comparisons.ticket.rows.map((r) => r.payout), color: "#718394" }] : []),
            ...(comparisons.twoTicket ? [{ name: "Two tickets", values: comparisons.twoTicket.rows.map((r) => r.payout), color: "#C57A36" }] : []),
          ]}
        />
      </Card> : null}
      {thesis && family ? <VoicePanel
        slug={family.slug}
        family={family}
        evidence={evidenceForSlug(family.slug, family.mode)}
        thesis={thesis}
        context="payoff"
        maxPayout={max}
        title="Ask about these scenario payouts"
      /> : null}
      <div className="flex gap-2">
        {comparisons ? <Button href={`/theses/${id}/compare?maxPayout=${encodeURIComponent(max)}`}>Compare offers</Button> : null}
        <Button href={`/theses/${id}`} kind="ghost">Edit view</Button>
      </div>
    </div>
  );
}
