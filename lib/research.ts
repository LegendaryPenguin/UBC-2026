import type { EvidenceItem, MarketFamily, ThesisRevision } from "@/lib/domain/types";
import { FEATURED_EVIDENCE } from "@/lib/evidence";
import { formatUsdc } from "@/lib/format";

export type PayoffExplanation = {
  maxPayout: string;
  rows: { label: string; custom: string; singleTicket: string | null; twoTickets: string | null }[];
  quote?: { kind: "live" | "paper"; status: string; premium: string; fee: string; maxPayout: string; expiresAt: number } | null;
};

export type ResearchTurn = { role: "user" | "assistant"; content: string };

function asksForView(question: string) {
  return /\b(create|draft|make|change|adjust|set|switch|narrow|wider|lower|raise)\b/.test(question) ||
    /\b(my view is|my thesis is|i expect|i think|i want to (create|build|change|set)|i want a (range|directional|view))\b/.test(question) ||
    (/\bbetween\b/.test(question) && /\b\d/.test(question));
}

function isTimeAmbiguousView(question: string) {
  return /\b(not\s+(?:a\s+)?break(?:out)?|without\s+(?:a\s+)?break(?:out)?|touch(?:es|ed|ing)?|intraday|at any point|before then)\b/i.test(question);
}

function mentionsSettlement(question: string) {
  return /\b(settle(?:ment|s)?|closing(?: price)?|close(?:s|d)?(?: price)?|expiry|expiration|observation|at the deadline)\b/i.test(question);
}

function explicitRange(question: string) {
  return /\bbetween\s+\$?\s*\d[\d,]*(?:\.\d+)?\s*[km]?\s+and\s+\$?\s*\d[\d,]*(?:\.\d+)?\s*[km]?\b/i.test(question);
}

function exactBinaryChoice(question: string) {
  return /\b(?:yes|no)\s+(?:on|for)\s+(?:this|the selected)\s+(?:exact\s+)?contract\b/i.test(question);
}

function formatAmount(value: string) {
  try { return `${formatUsdc(BigInt(value))} USDC`; } catch { return "unavailable"; }
}

export function proposeView(question: string, family: MarketFamily, thesis?: ThesisRevision | null): Partial<ThesisRevision> | undefined {
  const q = question.toLowerCase();
  if (!asksForView(q)) return undefined;

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
    // Do not translate a vague "rise, but not a breakout" into a bare YES.
    // The preview must reflect an explicit choice on this exact proposition.
    if (isTimeAmbiguousView(q) && !exactBinaryChoice(q)) return undefined;
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
  conversation?: ResearchTurn[];
  family: MarketFamily | null;
  thesis?: ThesisRevision | null;
  evidence?: EvidenceItem[];
  comparison?: PayoffExplanation | null;
}): { answer: string; citations: { id: string; title: string }[]; proposed?: Partial<ThesisRevision>; clarificationPrompt?: string } {
  const q = input.question.trim();
  const family = input.family;
  const conversation = input.conversation?.length ? input.conversation : [{ role: "user" as const, content: q }];
  const userDialogue = conversation.filter((turn) => turn.role === "user").map((turn) => turn.content).join(" ");
  const assistantDialogue = conversation.filter((turn) => turn.role === "assistant").map((turn) => turn.content).join(" ");
  const latestUser = [...conversation].reverse().find((turn) => turn.role === "user")?.content ?? q;
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

  const needsView = asksForView(userDialogue.toLowerCase());
  const ambiguousTiming = needsView && isTimeAmbiguousView(userDialogue);
  const settlementSpecified = mentionsSettlement(userDialogue);
  const selectingTouchExposure = /\b(touch(?:es|ed|ing)?|intraday|at any point)\b/i.test(latestUser) && !mentionsSettlement(latestUser);
  if (ambiguousTiming && selectingTouchExposure) {
    return withEvidenceCitations("The selected Gemini contract settles as a YES/NO outcome on its printed proposition; it does not pay based on whether price touched a level earlier. No view was proposed. Choose a market that explicitly supports touch-based settlement, or continue with this contract's official settlement outcome.");
  }
  if (ambiguousTiming && !settlementSpecified) {
    const contractWording = family.contracts[0]?.description;
    const prompt = contractWording
      ? `This selected Gemini contract resolves from its stated observation: “${contractWording}” Do you mean that official settlement, or are you looking for whether the price touches a level at any time before then?`
      : `Do you mean the market's official settlement observation (${family.observationTime || "not supplied"}), or whether the price touches a level at any time before then? These are different outcomes.`;
    return {
      ...withEvidenceCitations("Before I propose a view, I need to clarify when you mean the outcome to be measured."),
      clarificationPrompt: prompt,
    };
  }
  if (ambiguousTiming && settlementSpecified && family.predicates.length === 1 && family.contracts.length === 1 && !exactBinaryChoice(userDialogue)) {
    const prompt = `This market supports only YES or NO on “${family.contracts[0].label}” at the official observation. It cannot encode “rise but not break out” as a bounded range. Reply “YES on this contract” or “NO on this contract” to preview that exact proposition, or return to Explore to choose another market.`;
    return {
      ...withEvidenceCitations("Thanks. I will use the official settlement, not an earlier price touch. No view is selected yet."),
      clarificationPrompt: prompt,
    };
  }
  if (ambiguousTiming && settlementSpecified && family.predicates.length >= 2 && !explicitRange(userDialogue)) {
    const first = family.contracts.find((contract) => contract.id === family.predicates[0]?.contractId)?.label || family.predicates[0]?.label;
    const second = family.contracts.find((contract) => contract.id === family.predicates[1]?.contractId)?.label || family.predicates[1]?.label;
    const offeredRange = /\b(?:range\s+between\s+.+?\s+and\s+.+?|range\s+from\s+.+?\s+to\s+.+?)\b/i.test(assistantDialogue);
    const acceptedOfferedRange = offeredRange && /\b(yes|that works|use this range|looks right)\b/i.test(latestUser);
    if (!acceptedOfferedRange) {
      const prompt = `At settlement, the selected family offers these first two listed boundaries. Would a range from “${first}” to “${second}” match your view? Reply “yes, use this range” or name a different pair of listed thresholds.`;
      return {
        ...withEvidenceCitations("Thanks. I will use the official settlement, not an earlier price touch."),
        clarificationPrompt: prompt,
      };
    }
  }

  const acceptedOfferedRange = /\b(?:range\s+between\s+.+?\s+and\s+.+?|range\s+from\s+.+?\s+to\s+.+?)\b/i.test(assistantDialogue) &&
    /\b(yes|that works|use this range|looks right)\b/i.test(latestUser);
  const proposalQuestion = acceptedOfferedRange ? `${userDialogue} ${assistantDialogue}` : userDialogue;

  if (family.predicates.length === 1 && family.contracts.length === 1) {
    const contract = family.contracts[0];
    const suggested = proposeView(proposalQuestion, family, input.thesis);
    const exactChoiceNote = ambiguousTiming && exactBinaryChoice(userDialogue)
      ? " This YES/NO preview represents only the selected contract; it does not express a separate upper bound or a no-breakout condition."
      : "";
    const exactWording = contract.description ? ` Gemini's contract wording: ${contract.description}` : " The exact contract wording was not included in the market response; open the linked rules before relying on a settlement detail.";
    const source = contract.source || family.sourceEvent.sourceIndex;
    const sourceNote = source ? ` Listed settlement source: ${source}.` : " Gemini did not list a settlement source in this response.";
    const termsNote = contract.termsUrl
      ? "Open the exact contract rules link for the complete resolution rule."
      : "Gemini did not return a contract-specific rules link; event-level terms should not be treated as a substitute.";
    const answer = `${family.title}. The selected contract is “${contract.label}.”${exactWording} YES means Gemini resolves that exact proposition as YES; NO means it resolves NO. Observation: ${family.observationTime || "not published"}.${sourceNote} ${termsNote}${exactChoiceNote} This view covers this one contract only; it does not imply a price range or a different deadline. Research and the payoff preview are available without placing an order.`;
    return { ...withEvidenceCitations(answer), proposed: suggested };
  }

  const suggested = proposeView(proposalQuestion, family, input.thesis);
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
  if (acceptedOfferedRange && suggested?.template === "range") {
    const challenge = availableEvidence.find((item) => item.stance === "challenges");
    const evidenceNote = challenge
      ? ` A challenging item to review: ${challenge.title} [${challenge.id}].`
      : availableEvidence.length
        ? " Review the evidence board for the available context before confirming."
        : " No current evidence feed is available for this market.";
    return { ...withEvidenceCitations(`I drafted an editable settlement range between the two listed contract thresholds. Check the exact boundaries and compare every payout scenario before you save or confirm it.${evidenceNote}`), proposed: suggested };
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
