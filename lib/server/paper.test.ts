import { describe, expect, it, vi } from "vitest";
import type { StoreShape } from "@/lib/server/store";
import { POST as createThesis } from "@/app/api/theses/route";
import { PATCH as updateThesis, GET as readThesis } from "@/app/api/theses/[id]/route";
import { POST as requestQuote } from "@/app/api/quotes/route";
import { POST as acceptQuote } from "@/app/api/positions/route";
import { PATCH as updatePosition } from "@/app/api/positions/[id]/route";
import { POST as publish, GET as readSnapshot } from "@/app/api/publish/route";
import { listTopics } from "@/lib/gemini/catalog";

const { identity, store } = vi.hoisted(() => ({
  identity: { id: "alice" },
  store: {
    theses: [],
    quotes: [],
    positions: [],
    publications: [],
    transactions: [],
    journals: [],
    notifications: [],
    maker: { spreadBps: 400, paused: false },
  } as unknown as StoreShape,
}));

vi.mock("@/lib/server/session", () => ({
  currentSession: () => ({ account: { id: identity.id } }),
  thesisOwner: () => identity.id,
}));

vi.mock("@/lib/server/store", () => {
  let nextId = 0;
  return {
    readStore: () => store,
    mutate: <T>(update: (state: StoreShape) => T) => update(store),
    uid: (prefix: string) => `${prefix}_${++nextId}`,
  };
});

function request(body?: object, url = "http://localhost/api") {
  return body ? new Request(url, { method: "POST", body: JSON.stringify(body) }) : new Request(url);
}

describe("recorded paper walkthrough", () => {
  it("binds the quote to the confirmed thesis and claims the matching settlement once", async () => {
    const { families } = await listTopics("replay");
    const family = families.find((candidate) => candidate.sourceEvent.status === "settled")!;
    const response = await createThesis(request({ topicSlug: family.slug, familyId: family.id }));
    const { thesis } = await response.json();
    const thesisParams = { params: { id: thesis.id } };

    identity.id = "bob";
    expect((await readThesis(request(), thesisParams)).status).toBe(404);
    expect((await publish(request({ thesisId: thesis.id }))).status).toBe(404);
    identity.id = "alice";

    const form = { thesisId: thesis.id, maxPayout: "100.123456" };
    expect((await requestQuote(request({ ...form, mode: "paper" }))).status).toBe(400);
    await updateThesis(request({
      action: "confirm",
      template: "directional",
      direction: "no",
      lowerThreshold: family.predicates[0].threshold,
      rationale: "Private rationale",
    }), thesisParams);
    const { publication } = await (await publish(request({ thesisId: thesis.id }))).json();
    const snapshot = await readSnapshot(request(undefined, `http://localhost/api/publish?token=${publication.token}`));
    expect(await snapshot.json()).toEqual({ thesis: { topicSlug: family.slug } });

    const replay = await (await requestQuote(request({ ...form, mode: "replay" }))).json();
    expect(replay.quote.status).toBe("unavailable");
    expect((await acceptQuote(request({ quoteId: replay.quote.id, mode: "paper" }))).status).toBe(400);
    const paper = await (await requestQuote(request({ ...form, mode: "paper" }))).json();
    expect(paper.quote.signature).toBe("0x");
    expect(paper.spec.maxPayout).toBe("100123456");
    const acceptance = request({ quoteId: paper.quote.id, mode: "paper" });
    const { position } = await (await acceptQuote(acceptance.clone())).json();
    expect(position).toMatchObject({ thesisId: thesis.id, status: "resolved", txHash: null });
    expect((await acceptQuote(acceptance)).status).toBe(400);

    const claimParams = { params: { id: position.id } };
    const claim = request({ action: "claim" });
    const settled = await (await updatePosition(claim.clone(), claimParams)).json();
    expect(settled.position.status).toBe("claimed");
    expect((await updatePosition(claim, claimParams)).status).toBe(200);
    const claims = store.transactions.filter((transaction) => transaction.type === "claim_paper");
    expect(claims).toHaveLength(1);
    expect(claims[0]).toMatchObject({ amount: "100123456", hash: null });
  });
});
