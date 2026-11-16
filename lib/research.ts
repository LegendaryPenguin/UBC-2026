import type { EvidenceItem, MarketFamily, ThesisRevision } from "@/lib/domain/types";
import { FEATURED_EVIDENCE } from "@/lib/evidence";
import { formatUsdc } from "@/lib/format";

export type PayoffExplanation = {
  maxPayout: string;
  rows: { label: string; custom: string; singleTicket: string | null; twoTickets: string | null }[];
  quote?: { kind: "live" | "paper"; status: string; premium: string; fee: string; maxPayout: string; expiresAt: number } | null;
};

function formatAmount(value: string) {
  try { return `${formatUsdc(BigInt(value))} USDC`; } catch { return "unavailable"; }
}

export function proposeView(question: string, family: MarketFamily, thesis?: ThesisRevision | null): Partial<ThesisRevision> | undefined {
  const q = question.toLowerCase();
  const asksForView = /\b(create|draft|make|change|adjust|set|switch|narrow|wider|lower|raise)\b/.test(q) ||
    /\b(my view is|my thesis is|i expect|i think|i want to (create|build|change|set)|i want a (range|directional|view))\b/.test(q) ||
    (/\bbetween\b/.test(q) && /\b\d/.test(q));
  if (!asksForView) return undefined;

  const thresholds = [...new Set(family.predicates.map((predicate) => predicate.threshold))].sort((a, b) => a - b);
  if (!thresholds.length) return undefined;
  const mentioned = [...question.matchAll(/\$?\s*(\d[\d,]*(?:\.\d+)?)\s*([km])?\b/gi)]
    .map((match) => Number(match[1].replace(/,/g, "")) * (match[2]?.toLowerCase() === "k" ? 1_000 : match[2]?.toLowerCase() === "m" ? 1_000_000 : 1))
    .filter((value) => Number.isFinite(value));
  const matching = mentioned.flatMap((value) => {
    const nearest = thresholds.reduce((best, candidate) => Math.abs(candidate - value) < Math.abs(best - value) ? candidate : best, thresholds[0]);
    return Math.abs(nearest - value) <= Math.max(0.01, Math.abs(value) * 0.002) ? [nearest] : [];
  });
  const picked = [...new Set(matching)].sort((a, b) => a - b);

  if (family.predicates.length === 1 && family.contracts.length === 1) {
    if (!/\b(yes|no|long|short|bullish|bearish|rise|fall|up|down|expect|think|view|thesis|set|change|draft|create)\b/.test(q)) return undefined;
    const direction = /\b(no|short|bearish|fall|down|below|under)\b/.test(q) ? "no" : "yes";
    return {
      template: "binary",
      direction,
      lowerThreshold: null,
      upperThreshold: null,
      rationale: thesis?.rationale ?? question.trim(),
      invalidation: thesis?.invalidation ?? "",
    };
  }

  if (/\b(range|interval|between|outside|narrow|wider)\b/.test(q) && thresholds.length >= 2) {
    let lower = picked[0] ?? thesis?.lowerThreshold ?? thresholds[0];
    let upper = picked[1] ?? thesis?.upperThreshold ?? thresholds[1];
    if (/\bnarrow\w*\b/.test(q) && thesis?.lowerThreshold != null && thesis.upperThreshold != null) {
      const inside = thresholds.filter((value) => value > thesis!.lowerThreshold! && value < thesis!.upperThreshold!);
      if (inside.length) upper = inside[inside.length - 1];
    }
    if (/\bwider\b/.test(q) && thesis?.upperThreshold != null) {
      upper = thresholds.find((value) => value > thesis!.upperThreshold!) ?? upper;
    }
    if (!(lower < upper)) return undefined;
    return {
      template: /\boutside\b/.test(q) ? "outside" : "range",
      direction: null,
      lowerThreshold: lower,
      upperThreshold: upper,
      rationale: thesis?.rationale ?? question.trim(),
      invalidation: thesis?.invalidation ?? "",
    };
  }

  if (/\b(yes|above|at least|up|bullish|long|below|under|no|down|bearish|short|directional)\b/.test(q)) {
    const direction = /\b(below|under|no|down|bearish|short)\b/.test(q) ? "no" : "yes";
    let threshold = picked[0] ?? thesis?.lowerThreshold ?? thresholds[0];
    if (/\bnext\b/.test(q) && thesis?.lowerThreshold != null) {
      threshold = thresholds.find((value) => value > thesis!.lowerThreshold!) ?? threshold;
    }
    return {
      template: "directional",
      direction,
      lowerThreshold: threshold,
      upperThreshold: null,
      rationale: thesis?.rationale ?? question.trim(),
      invalidation: thesis?.invalidation ?? "",
    };
  }
  return undefined;
}

export function researchReply(input: {
  question: string;
  family: MarketFamily | null;
  thesis?: ThesisRevision | null;
  evidence?: EvidenceItem[];
  comparison?: PayoffExplanation | null;
}): { answer: string; citations: { id: string; title: string }[]; proposed?: Partial<ThesisRevision> } {
  const q = input.question.trim();
  const family = input.family;
  const availableEvidence = input.evidence || FEATURED_EVIDENCE.slice(0, 2);
  function withEvidenceCitations(answer: string) {
    const byId = new Map(availableEvidence.map((item) => [item.id, item]));
    const ids = [...new Set([...answer.matchAll(/\[(ev-[a-z0-9-]+)\]/gi)].map((match) => match[1]))];
    const citations = ids.flatMap((id) => byId.has(id) ? [{ id, title: byId.get(id)!.title }] : []);
    const safeAnswer = answer.replace(/\[(ev-[^\]]+)\]/gi, (marker, id: string) => byId.has(id) ? marker : "");
    return { answer: safeAnswer.trim(), citations };
  }
  if (!family) {
    return withEvidenceCitations("Pick a supported topic first. I can explain listed thresholds, source rules, and how a range view differs from a single YES ticket. I cannot place a trade.");
  }

  if (family.predicates.length === 1 && family.contracts.length === 1) {
    const contract = family.contracts[0];
    const suggested = proposeView(q, family, input.thesis);
    const answer = `${family.title}. The selected contract is “${contract.label}.” YES means Gemini resolves that exact proposition as YES; NO means it resolves NO. Observation: ${family.observationTime || "not published"}. Check the linked terms for the full resolution rule. This view covers this one contract only; it does not imply a price range or a different deadline. Research and the payoff preview are available without placing an order.`;
    return { ...withEvidenceCitations(answer), proposed: suggested };
  }

  const suggested = proposeView(q, family, input.thesis);
  const thresholds = family.predicates.map((p) => p.threshold).join(", ");
  const lower = family.predicates[0]?.threshold ?? null;
  const upper = family.predicates[1]?.threshold ?? null;
  if (input.comparison && /\b(compare|comparison|basket|scenario|ticket|payout|payoff|fee|premium|cost)\b/i.test(q)) {
    const rows = input.comparison.rows.map((row) =>
      `${row.label}: custom ${formatAmount(row.custom)}${row.singleTicket == null ? "" : `; single threshold ticket ${formatAmount(row.singleTicket)}`}${row.twoTickets == null ? "" : `; two-ticket basket ${formatAmount(row.twoTickets)}`}`,
    );
    const quote = input.comparison.quote;
    const quoteText = quote
      ? ` The latest ${quote.kind} quote is ${quote.status} for a ${formatAmount(quote.maxPayout)} maximum payout; premium ${formatAmount(quote.premium)} and fee ${formatAmount(quote.fee)}${quote.expiresAt * 1000 <= Date.now() ? " (expired)" : ` (expires ${new Date(quote.expiresAt * 1000).toISOString()})`}.`
      : " No quote is included in this comparison.";
    const rangeEvidence = availableEvidence.find((item) => /lower threshold.*pays above|higher bin|different payoff/i.test(item.excerpt));
    const ruleNote = rangeEvidence
      ? ` A lower-threshold YES ticket also pays above the next threshold, which is why it differs from a bounded range [${rangeEvidence.id}].`
      : "";
    return { ...withEvidenceCitations(`Scenario comparison at a maximum payout of ${formatAmount(input.comparison.maxPayout)}: ${rows.join(". ")}.${quoteText} These are payoff schedules, not executable liquidity. A native Gemini ticket and an Arc custom payoff have separate execution and settlement rules.${ruleNote}`), proposed: suggested };
  }
  if (/wrong|lose|if i am wrong/i.test(q)) {
    return { ...withEvidenceCitations(`If the observed value settles outside your chosen payout scenarios, the custom payoff pays 0 and the premium is the maximum loss, plus any displayed fee. Settlement follows ${family.sourceEvent.sourceAgency || "the listed source"} at ${family.observationTime || "the listed observation time"}.`), proposed: suggested };
  }
  if (/range|between|interval/i.test(q) && lower != null && upper != null) {
    const rangeEvidence = availableEvidence.find((item) => /lower threshold.*pays above|higher bin|different payoff/i.test(item.excerpt));
    const rangeMarker = rangeEvidence ? ` [${rangeEvidence.id}]` : "";
    return {
      ...withEvidenceCitations(`A range from ${lower} to ${upper} pays only in that bin. A YES ticket on ${lower} still pays above ${upper}. Confirm inclusive bounds against the printed contract labels. Thresholds on this family: ${thresholds}.${rangeMarker}`),
      proposed: suggested || {
        template: "range",
        lowerThreshold: input.thesis?.lowerThreshold ?? lower,
        upperThreshold: input.thesis?.upperThreshold ?? upper,
        rationale: input.thesis?.rationale ?? q,
      },
    };
  }
  return { ...withEvidenceCitations(`${family.title}. Observation ${family.observationTime || "unspecified"}. Source status ${family.sourceEvent.status}. Listed thresholds: ${thresholds}. I can explain or propose an editable view; accepting a quote and moving funds always use the separate review controls.`), proposed: suggested };
}
