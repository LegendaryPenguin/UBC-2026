import type { MarketFamily, PayoffSpec } from "@/lib/domain/types";

function mid(bid: string | null, ask: string | null): number | null {
  const b = bid ? Number(bid) : NaN;
  const a = ask ? Number(ask) : NaN;
  if (!Number.isFinite(b) || !Number.isFinite(a)) return null;
  return (b + a) / 2;
}

export function quotePremium(family: MarketFamily, spec: PayoffSpec, spreadBps: number): {
  premium: bigint;
  note: string;
  usedMids: boolean;
} {
  const M = spec.maxPayout;
  let expected = 0n;
  let used = 0;
  for (const row of spec.rows) {
    const scenario = family.scenarios.find((s) => s.id === row.scenarioId);
    if (!scenario) continue;
    const preds = family.predicates.filter((p) => scenario.predicateYes[p.id]);
    const contract = preds.length
      ? family.contracts.find((c) => c.id === preds[preds.length - 1].contractId)
      : family.contracts[0];
    const m = contract ? mid(contract.bid, contract.ask) : null;
    if (m == null) continue;
    used += 1;
    expected += BigInt(Math.round(Number(row.payout) * m));
  }
  if (used === 0) {
    const fallback = (M * 40n) / 100n;
    const withSpread = fallback + (fallback * BigInt(spreadBps)) / 10_000n;
    return { premium: withSpread, note: "No live mids. Premium is a labeled inventory quote, not an exchange fill.", usedMids: false };
  }
  const withSpread = expected + (expected * BigInt(spreadBps)) / 10_000n;
  const bounded = withSpread > M ? M : withSpread;
  const minPrem = M / 100n;
  return {
    premium: bounded < minPrem ? minPrem : bounded,
    note: "Premium uses Gemini mids plus the maker spread. It is a firm maker quote, not a Gemini fill.",
    usedMids: true,
  };
}
