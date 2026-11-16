import { describe, expect, it } from "vitest";
import { evidenceForSlug } from "@/lib/evidence";
import { listTopics } from "@/lib/gemini/catalog";
import { proposeView, researchReply } from "@/lib/research";

describe("research and editable view proposals", () => {
  it("only proposes boundaries that exist in the selected market family", async () => {
    const { families } = await listTopics("replay");
    const family = families.find((candidate) => candidate.predicates.length >= 2)!;
    const [lower, upper] = family.predicates.map((predicate) => predicate.threshold);

    expect(proposeView(`Set my view to a range between ${lower} and ${upper}`, family)).toMatchObject({
      template: "range",
      lowerThreshold: lower,
      upperThreshold: upper,
    });
    expect(proposeView("Set the threshold to 123456789", family)).toBeUndefined();
  });

  it("links only the replay evidence that supports a payoff explanation", async () => {
    const { families } = await listTopics("replay");
    const family = families.find((candidate) => candidate.predicates.length >= 2)!;
    const replayReply = researchReply({
      question: "How does the range differ from one YES ticket?",
      family,
      evidence: evidenceForSlug(family.slug, "replay"),
    });
    expect(replayReply.citations.map((citation) => citation.id)).toContain("ev-range");
    expect(replayReply.answer).toContain("[ev-range]");

    const liveReply = researchReply({
      question: "How does the range differ from one YES ticket?",
      family: { ...family, mode: "live" },
      evidence: evidenceForSlug(family.slug, "live"),
    });
    expect(liveReply.citations).toEqual([]);
  });

  it("explains the exact Gemini contract wording and source for a live binary thesis", async () => {
    const { families } = await listTopics("replay");
    const base = families.find((candidate) => candidate.predicates.length >= 2)!;
    const contract = { ...base.contracts[0], description: "If BTC is $95,000 or above at expiry, this resolves YES. Otherwise, NO.", source: "LS-LRRR-XBTUSD" };
    const family = { ...base, predicates: [base.predicates[0]], contracts: [contract] };
    const answer = researchReply({ question: "Explain this contract.", family }).answer;

    expect(answer).toContain(contract.description);
    expect(answer).toContain("LS-LRRR-XBTUSD");
    expect(answer).toContain("does not imply a price range or a different deadline");
  });

  it("does not suggest event-level terms replace missing contract rules", async () => {
    const { families } = await listTopics("replay");
    const base = families.find((candidate) => candidate.predicates.length >= 2)!;
    const contract = { ...base.contracts[0], termsUrl: null, description: null };
    const family = { ...base, predicates: [base.predicates[0]], contracts: [contract] };
    const answer = researchReply({ question: "Explain this contract.", family }).answer;

    expect(answer).toContain("exact contract wording was not included");
    expect(answer).toContain("did not return a contract-specific rules link");
    expect(answer).toContain("event-level terms should not be treated as a substitute");
  });
});
