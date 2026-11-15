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
});
