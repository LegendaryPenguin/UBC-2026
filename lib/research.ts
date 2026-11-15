import type { EvidenceItem, MarketFamily, ThesisRevision } from "@/lib/domain/types";
import { FEATURED_EVIDENCE } from "@/lib/evidence";

export function researchReply(input: {
  question: string;
  family: MarketFamily | null;
  thesis?: ThesisRevision | null;
  evidence?: EvidenceItem[];
}): { answer: string; citations: { id: string; title: string }[]; proposed?: Partial<ThesisRevision> } {
  const q = input.question.trim();
  const family = input.family;
  const citations = (input.evidence || FEATURED_EVIDENCE.slice(0, 2)).map((e) => ({ id: e.id, title: e.title }));
  if (!family) {
    return {
      answer:
        "Pick a supported topic first. I can explain listed thresholds, source rules, and how a range view differs from a single YES ticket. I cannot place a trade.",
      citations: [],
    };
  }
  const thresholds = family.predicates.map((p) => p.threshold).join(", ");
  const lower = family.predicates[0]?.threshold ?? null;
  const upper = family.predicates[1]?.threshold ?? null;
  if (/wrong|lose|if i am wrong/i.test(q)) {
    return {
      answer: `If the observed value settles outside your chosen scenarios, the custom payoff pays 0 and the premium is the maximum loss, plus any displayed fee. Settlement follows ${family.sourceEvent.sourceAgency || "the listed source"} at ${family.observationTime || "the listed observation time"}.`,
      citations,
    };
  }
  if (/range|between|interval/i.test(q) && lower != null && upper != null) {
    return {
      answer: `A range from ${lower} to ${upper} pays only in that bin. A YES ticket on ${lower} still pays above ${upper}. Confirm inclusive bounds against the printed contract labels. Thresholds on this family: ${thresholds}.`,
      citations,
      proposed: {
        template: "range",
        lowerThreshold: lower,
        upperThreshold: upper,
        rationale: q,
      },
    };
  }
  return {
    answer: `${family.title}. Observation ${family.observationTime || "unspecified"}. Source status ${family.sourceEvent.status}. Listed thresholds: ${thresholds}. I can draft a view; I will not accept a quote or move funds.`,
    citations,
  };
}
