import { describe, expect, it } from "vitest";
import { evidenceForSlug } from "@/lib/evidence";
import { listTopics } from "@/lib/gemini/catalog";
import { marketDiscovery, proposeView, researchReply } from "@/lib/research";

describe("research and editable view proposals", () => {
  it("asks for the subject and carries the original observation into the follow-up search", () => {
    const observation = "I think it could rise this month, but I don’t expect a huge breakout.";
    const reply = researchReply({ question: observation, family: null });
    expect(reply.answer).toContain("Which asset or event");
    const discovery = marketDiscovery("Bitcoin", [
      { role: "user", content: observation }, { role: "assistant", content: reply.answer }, { role: "user", content: "Bitcoin" },
    ]);
    expect(discovery.queries).toContain("BTC");
    expect(discovery.view).toBe("Rise with limited upside");
    expect(discovery.horizon).toBe("this month");
    expect(discovery.observationText).toContain(observation);
  });
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

  it("clarifies timing and enforces the single-contract YES/NO limit before suggesting a view", async () => {
    const { families } = await listTopics("replay");
    const base = families.find((candidate) => candidate.predicates.length >= 2)!;
    const family = {
      ...base,
      predicates: [base.predicates[0]],
      contracts: [{ ...base.contracts[0], description: "At Friday's settlement, this contract resolves YES above the listed threshold." }],
    };
    const turns: { role: "user" | "assistant"; content: string }[] = [
      { role: "user", content: "I expect a rise, but not a breakout." },
    ];
    const timing = researchReply({ question: turns[0].content, conversation: turns, family });
    expect(timing.clarificationPrompt).toContain("official settlement");
    expect(timing.proposed).toBeUndefined();

    turns.push({ role: "assistant", content: timing.clarificationPrompt! });
    turns.push({ role: "user", content: "At Friday's settlement." });
    const boundary = researchReply({ question: turns.at(-1)!.content, conversation: turns, family });
    expect(boundary.clarificationPrompt).toContain("only YES or NO");
    expect(boundary.proposed).toBeUndefined();

    turns.push({ role: "assistant", content: boundary.clarificationPrompt! });
    turns.push({ role: "user", content: "YES on this contract." });
    const selected = researchReply({ question: turns.at(-1)!.content, conversation: turns, family });
    expect(selected.clarificationPrompt).toBeUndefined();
    expect(selected.proposed).toMatchObject({ template: "binary", direction: "yes" });
    expect(selected.answer).toContain("does not express a separate upper bound");
  });

  it("proposes listed settlement boundaries only after the user accepts the clarified range", async () => {
    const { families } = await listTopics("replay");
    const family = families.find((candidate) => candidate.predicates.length >= 2)!;
    const turns: { role: "user" | "assistant"; content: string }[] = [
      { role: "user", content: "I expect a rise, but not a breakout." },
    ];
    const timing = researchReply({ question: turns[0].content, conversation: turns, family });
    turns.push({ role: "assistant", content: timing.clarificationPrompt! });
    turns.push({ role: "user", content: "At Friday's settlement." });
    const bounds = researchReply({ question: turns.at(-1)!.content, conversation: turns, family });
    expect(bounds.clarificationPrompt).toContain("Would a range from");
    const offeredIndex = family.predicates.length > 5 ? Math.floor(family.predicates.length / 2) - 1 : 0;
    const [lower, upper] = family.predicates.slice(offeredIndex, offeredIndex + 2);
    expect(bounds.clarificationPrompt).toContain(lower.label);
    expect(bounds.clarificationPrompt).toContain(upper.label);
    turns.push({ role: "assistant", content: bounds.clarificationPrompt! });
    turns.push({ role: "user", content: "Yes, use this range." });

    const evidence = evidenceForSlug(family.slug, "replay");
    const result = researchReply({ question: turns.at(-1)!.content, conversation: turns, family, evidence });
    expect(result.proposed).toMatchObject({
      template: "range",
      lowerThreshold: lower.threshold,
      upperThreshold: upper.threshold,
    });
    expect(result.answer).toContain("editable settlement range");
    expect(result.citations.some((citation) => evidence.find((item) => item.id === citation.id)?.stance === "challenges")).toBe(true);
  });
});
