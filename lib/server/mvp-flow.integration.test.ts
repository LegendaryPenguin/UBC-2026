import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const cookieJar = vi.hoisted(() => ({ values: new Map<string, string>() }));

vi.mock("next/headers", () => ({
  cookies: () => ({
    get: (name: string) => {
      const value = cookieJar.values.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set: (name: string, value: string) => { cookieJar.values.set(name, value); },
    delete: (name: string) => { cookieJar.values.delete(name); },
  }),
}));

type JsonResponse<T> = { response: Response; body: T };
async function json<T>(response: Response): Promise<JsonResponse<T>> {
  return { response, body: await response.json() as T };
}

function request(url: string, method = "GET", body?: unknown) {
  return new Request(`http://localhost${url}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("narrated MVP API flow", () => {
  let tempDir = "";
  let priorStoreFile: string | undefined;
  let priorXaiKey: string | undefined;
  let topicsGet: typeof import("@/app/api/topics/route").GET;
  let topicGet: typeof import("@/app/api/topics/[slug]/route").GET;
  let researchPost: typeof import("@/app/api/research/route").POST;
  let thesesPost: typeof import("@/app/api/theses/route").POST;
  let thesisGet: typeof import("@/app/api/theses/[id]/route").GET;
  let thesisPatch: typeof import("@/app/api/theses/[id]/route").PATCH;
  let historyGet: typeof import("@/app/api/theses/[id]/history/route").GET;
  let quotesPost: typeof import("@/app/api/quotes/route").POST;
  let quoteGet: typeof import("@/app/api/quotes/[id]/route").GET;
  let positionsGet: typeof import("@/app/api/positions/route").GET;
  let positionsPost: typeof import("@/app/api/positions/route").POST;
  let positionGet: typeof import("@/app/api/positions/[id]/route").GET;
  let positionPatch: typeof import("@/app/api/positions/[id]/route").PATCH;
  let alertsGet: typeof import("@/app/api/alerts/route").GET;
  let alertsPost: typeof import("@/app/api/alerts/route").POST;
  let alertsPatch: typeof import("@/app/api/alerts/route").PATCH;
  let store: typeof import("@/lib/server/store");
  let createSession: typeof import("@/lib/server/session").createSession;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "thesis-mvp-flow-"));
    priorStoreFile = process.env.THESIS_STORE_FILE;
    priorXaiKey = process.env.XAI_API_KEY;
    process.env.THESIS_STORE_FILE = path.join(tempDir, "store.json");
    delete process.env.XAI_API_KEY;
    cookieJar.values.clear();
    vi.resetModules();

    const [topics, topic, research, theses, thesis, history, quotes, quote, positions, position, alerts, storeModule, sessionModule] = await Promise.all([
      import("@/app/api/topics/route"),
      import("@/app/api/topics/[slug]/route"),
      import("@/app/api/research/route"),
      import("@/app/api/theses/route"),
      import("@/app/api/theses/[id]/route"),
      import("@/app/api/theses/[id]/history/route"),
      import("@/app/api/quotes/route"),
      import("@/app/api/quotes/[id]/route"),
      import("@/app/api/positions/route"),
      import("@/app/api/positions/[id]/route"),
      import("@/app/api/alerts/route"),
      import("@/lib/server/store"),
      import("@/lib/server/session"),
    ]);
    topicsGet = topics.GET;
    topicGet = topic.GET;
    researchPost = research.POST;
    thesesPost = theses.POST;
    thesisGet = thesis.GET;
    thesisPatch = thesis.PATCH;
    historyGet = history.GET;
    quotesPost = quotes.POST;
    quoteGet = quote.GET;
    positionsGet = positions.GET;
    positionsPost = positions.POST;
    positionGet = position.GET;
    positionPatch = position.PATCH;
    alertsGet = alerts.GET;
    alertsPost = alerts.POST;
    alertsPatch = alerts.PATCH;
    store = storeModule;
    createSession = sessionModule.createSession;

    const now = new Date().toISOString();
    store.mutate((state) => {
      state.accounts.push({
        id: "acct_mvp_flow",
        email: "mvp-flow@example.test",
        handle: "mvp-flow",
        name: "MVP Flow",
        createdAt: now,
        timezone: "UTC",
        displayCurrency: "USD",
        density: "beginner",
        onboardingComplete: true,
        interests: ["crypto"],
        wallet: null,
        closed: false,
      });
    });
    createSession("acct_mvp_flow");
  }, 30_000);

  afterAll(() => {
    if (priorStoreFile === undefined) delete process.env.THESIS_STORE_FILE;
    else process.env.THESIS_STORE_FILE = priorStoreFile;
    if (priorXaiKey === undefined) delete process.env.XAI_API_KEY;
    else process.env.XAI_API_KEY = priorXaiKey;
    cookieJar.values.clear();
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("covers Explore → Research → confirm → Paper quote → Portfolio/History and recovery", async () => {
    const list = await json<{ families: { slug: string; title: string; sourceEvent: { ticker: string } }[] }>(await topicsGet(request("/api/topics?mode=replay")));
    expect(list.response.status).toBe(200);
    const btcTopic = list.body.families.find((family) => family.sourceEvent.ticker === "BTC2611202200");
    expect(btcTopic).toBeDefined();
    const btcSlug = btcTopic!.slug;

    const topic = await json<{ family: { id: string; version: string; slug: string; predicates: { threshold: number }[] }; evidence: unknown[] }>(
      await topicGet(request(`/api/topics/${btcSlug}?mode=replay`), { params: { slug: btcSlug } }),
    );
    expect(topic.response.status).toBe(200);
    expect(topic.body.family.predicates.length).toBeGreaterThan(2);
    expect(topic.body.evidence.length).toBeGreaterThan(0);

    const research = await json<{ answer: string; provider: string; proposed?: unknown }>(await researchPost(request("/api/research", "POST", {
      slug: topic.body.family.slug,
      mode: "replay",
      context: "research",
      question: "I think Bitcoin finishes between two prices at Friday's settlement. What should I clarify?",
    })));
    expect(research.response.status).toBe(200);
    expect(research.body.answer.length).toBeGreaterThan(0);
    expect(research.body.provider).toBe("local");
    expect(research.body.proposed).toBeDefined();

    const thresholds = [...topic.body.family.predicates.map((item) => item.threshold)].sort((a, b) => a - b);
    const lower = thresholds[Math.floor(thresholds.length / 3)];
    const upper = thresholds[Math.floor((thresholds.length * 2) / 3)];
    const created = await json<{ thesis: { id: string; status: string; revision: number } }>(await thesesPost(request("/api/theses", "POST", {
      topicSlug: topic.body.family.slug,
      familyId: topic.body.family.id,
      familyVersion: topic.body.family.version,
      template: "range",
      direction: "yes",
      lowerThreshold: lower,
      upperThreshold: upper,
      rationale: "Price closes within the selected interval.",
      invalidation: "The view changes if the settlement question differs.",
      evidenceIds: [],
      mode: "replay",
    })));
    expect(created.response.status).toBe(200);
    expect(created.body.thesis.status).toBe("draft");
    const thesisId = created.body.thesis.id;

    const invalidConfirm = await json<{ message?: string }>(await thesisPatch(request(`/api/theses/${thesisId}`, "PATCH", {
      action: "confirm", template: "range", lowerThreshold: upper, upperThreshold: lower, mode: "replay",
    }), { params: { id: thesisId } }));
    expect(invalidConfirm.response.status).toBe(409);
    const draftAfterRejection = await json<{ thesis: { status: string; revision: number } }>(await thesisGet(request(`/api/theses/${thesisId}`), { params: { id: thesisId } }));
    expect(draftAfterRejection.body.thesis.status).toBe("draft");
    expect(draftAfterRejection.body.thesis.revision).toBe(created.body.thesis.revision);

    const confirmed = await json<{ thesis: { status: string; revision: number } }>(await thesisPatch(request(`/api/theses/${thesisId}`, "PATCH", {
      action: "confirm", mode: "replay",
    }), { params: { id: thesisId } }));
    expect(confirmed.response.status).toBe(200);
    expect(confirmed.body.thesis.status).toBe("confirmed");

    const saved = await json<{ thesis: { status: string; revision: number } }>(await thesisPatch(request(`/api/theses/${thesisId}`, "PATCH", {
      rationale: "Updated after reviewing challenging evidence.",
    }), { params: { id: thesisId } }));
    expect(saved.body.thesis.status).toBe("draft");
    const confirmedAgain = await json<{ thesis: { status: string; revision: number } }>(await thesisPatch(request(`/api/theses/${thesisId}`, "PATCH", {
      action: "confirm", mode: "replay",
    }), { params: { id: thesisId } }));
    expect(confirmedAgain.body.thesis.status).toBe("confirmed");

    const quotesBeforeVoiceExplanation = store.readStore().quotes.length;
    const payoffExplanation = await json<{
      answer: string;
      provider: string;
      comparison?: { maxPayout: string; rows: { label: string; custom: string }[]; quote: unknown };
    }>(await researchPost(request("/api/research", "POST", {
      question: "Explain this basket across every settlement scenario.",
      slug: topic.body.family.slug,
      thesisId,
      mode: "paper",
      context: "payoff",
      maxPayout: "100",
    })));
    expect(payoffExplanation.response.status).toBe(200);
    expect(payoffExplanation.body.answer).toContain("Scenario comparison at a maximum payout of 100 USDC");
    expect(payoffExplanation.body.comparison?.maxPayout).toBeTruthy();
    expect(payoffExplanation.body.comparison?.rows.length).toBeGreaterThan(2);
    expect(payoffExplanation.body.comparison?.rows[0].label).toBeTruthy();
    expect(payoffExplanation.body.comparison?.quote).toBeNull();
    expect(store.readStore().quotes).toHaveLength(quotesBeforeVoiceExplanation);

    const comparisonExplanation = await json<{ answer: string; comparison?: { rows: { label: string; custom: string }[]; quote: unknown } }>(await researchPost(request("/api/research", "POST", {
      question: "Compare the basket payouts across scenarios.",
      slug: topic.body.family.slug,
      thesisId,
      mode: "paper",
      context: "compare",
      maxPayout: "100",
    })));
    expect(comparisonExplanation.response.status).toBe(200);
    expect(comparisonExplanation.body.answer).toContain("Scenario comparison at a maximum payout of 100 USDC");
    expect(comparisonExplanation.body.comparison?.rows.length).toBeGreaterThan(2);
    expect(comparisonExplanation.body.comparison?.quote).toBeNull();
    expect(store.readStore().quotes).toHaveLength(quotesBeforeVoiceExplanation);

    const quote = await json<{ quote: { id: string; status: string; signature: string; payouts: string[] }; note: string }>(await quotesPost(request("/api/quotes", "POST", {
      thesisId,
      mode: "paper",
      maxPayout: "100",
    })));
    expect(quote.response.status).toBe(200);
    expect(quote.body.quote.status).toBe("available");
    expect(quote.body.quote.signature).toBe("0x");
    expect(quote.body.quote.payouts.length).toBe(topic.body.family.predicates.length + 1);

    const quoteRead = await json<{ quote: { id: string; status: string } }>(await quoteGet(request(`/api/quotes/${quote.body.quote.id}`), { params: { id: quote.body.quote.id } }));
    expect(quoteRead.response.status).toBe(200);
    expect(quoteRead.body.quote.status).toBe("available");

    const accepted = await json<{ position: { id: string; thesisId: string; quoteId: string; mode: string; status: string }; duplicate?: boolean }>(await positionsPost(request("/api/positions", "POST", {
      quoteId: quote.body.quote.id,
      mode: "paper",
    })));
    expect(accepted.response.status).toBe(200);
    expect(accepted.body.position.mode).toBe("paper");
    expect(accepted.body.position.status).toBe("open");
    expect(accepted.body.position.thesisId).toBe(thesisId);

    const duplicate = await json<{ position: { id: string }; duplicate: boolean }>(await positionsPost(request("/api/positions", "POST", {
      quoteId: quote.body.quote.id,
      mode: "paper",
    })));
    expect(duplicate.response.status).toBe(200);
    expect(duplicate.body.duplicate).toBe(true);
    expect(duplicate.body.position.id).toBe(accepted.body.position.id);

    const portfolio = await json<{ positions: { id: string; thesisId: string }[] }>(await positionsGet());
    expect(portfolio.body.positions.map((position) => position.id)).toContain(accepted.body.position.id);
    const positionRead = await json<{ position: { id: string; status: string }; walletAddress: string | null }>(await positionGet(request(`/api/positions/${accepted.body.position.id}`), { params: { id: accepted.body.position.id } }));
    expect(positionRead.body.position.status).toBe("open");

    const history = await json<{ versions: { revision: number }[]; timeline: { kind: string; mode?: string }[] }>(await historyGet(request(`/api/theses/${thesisId}/history`), { params: { id: thesisId } }));
    expect(history.response.status).toBe(200);
    expect(history.body.versions.length).toBeGreaterThanOrEqual(3);
    expect(history.body.timeline.map((item) => item.kind)).toEqual(["quote", "position"]);
    expect(history.body.timeline[0].mode).toBe("paper");

    const duplicateThesis = await json<{ thesis: { id: string; status: string } }>(await thesisPatch(request(`/api/theses/${thesisId}`, "PATCH", { action: "duplicate" }), { params: { id: thesisId } }));
    expect(duplicateThesis.response.status).toBe(200);
    expect(duplicateThesis.body.thesis.id).not.toBe(thesisId);
    expect(duplicateThesis.body.thesis.status).toBe("draft");
    const restored = await json<{ thesis: { id: string; status: string; rationale: string } }>(await thesisPatch(request(`/api/theses/${thesisId}`, "PATCH", { action: "restore", revision: 2 }), { params: { id: thesisId } }));
    expect(restored.response.status).toBe(200);
    expect(restored.body.thesis.id).not.toBe(thesisId);
    expect(restored.body.thesis.status).toBe("draft");

    const createdAlert = await json<{ alert: { id: string; paused: boolean } }>(await alertsPost(request("/api/alerts", "POST", {
      name: "Position settlement update",
      type: "claim",
      positionId: accepted.body.position.id,
    })));
    expect(createdAlert.response.status).toBe(201);
    const pausedAlert = await json<{ alert: { paused: boolean } }>(await alertsPatch(request("/api/alerts", "PATCH", {
      id: createdAlert.body.alert.id,
      paused: true,
    })));
    expect(pausedAlert.body.alert.paused).toBe(true);
    const resumedAlert = await json<{ alert: { paused: boolean } }>(await alertsPatch(request("/api/alerts", "PATCH", {
      id: createdAlert.body.alert.id,
      paused: false,
    })));
    expect(resumedAlert.body.alert.paused).toBe(false);
    const alertList = await json<{ alerts: { id: string; paused: boolean; triggeredAt?: string }[] }>(await alertsGet());
    expect(alertList.body.alerts.some((alert) => alert.id === createdAlert.body.alert.id && !alert.paused && !alert.triggeredAt)).toBe(true);
  });

  it("supports a settled Paper outcome and blocks cross-account reads", async () => {
    const list = await json<{ families: { slug: string; title: string; sourceEvent: { ticker: string } }[] }>(await topicsGet(request("/api/topics?mode=replay")));
    const xrpTopic = list.body.families.find((family) => family.sourceEvent.ticker === "XRP05M2611141105");
    expect(xrpTopic).toBeDefined();
    const topic = await json<{ family: { id: string; version: string; slug: string; predicates: { threshold: number }[] } }>(
      await topicGet(request(`/api/topics/${xrpTopic!.slug}?mode=replay`), { params: { slug: xrpTopic!.slug } }),
    );
    expect(topic.response.status).toBe(200);
    const thesis = await json<{ thesis: { id: string; status: string } }>(await thesesPost(request("/api/theses", "POST", {
      topicSlug: topic.body.family.slug,
      familyId: topic.body.family.id,
      familyVersion: topic.body.family.version,
      template: "binary",
      direction: "no",
      mode: "replay",
    })));
    const thesisId = thesis.body.thesis.id;
    const confirmed = await json<{ thesis: { status: string } }>(await thesisPatch(request(`/api/theses/${thesisId}`, "PATCH", { action: "confirm", mode: "replay" }), { params: { id: thesisId } }));
    expect(confirmed.body.thesis.status).toBe("confirmed");

    const quote = await json<{ quote: { id: string; status: string } }>(await quotesPost(request("/api/quotes", "POST", { thesisId, mode: "paper", maxPayout: "25" })));
    expect(quote.response.status).toBe(200);
    const accepted = await json<{ position: { id: string; status: string; scenarioIndex: number | null } }>(await positionsPost(request("/api/positions", "POST", { quoteId: quote.body.quote.id, mode: "paper" })));
    expect(accepted.response.status).toBe(200);
    expect(accepted.body.position.status).toBe("resolved");
    const alert = await json<{ alert: { id: string; triggeredAt?: string } }>(await alertsPost(request("/api/alerts", "POST", {
      name: "XRP resolution follow-up",
      type: "claim",
      positionId: accepted.body.position.id,
    })));
    expect(alert.response.status).toBe(201);
    await alertsPatch(request("/api/alerts", "PATCH", { id: alert.body.alert.id, paused: true }));
    const pausedCheck = await json<{ alerts: { id: string; triggeredAt?: string }[]; notifications: { href: string }[] }>(await alertsGet());
    expect(pausedCheck.body.alerts.find((item) => item.id === alert.body.alert.id)?.triggeredAt).toBeUndefined();
    expect(pausedCheck.body.notifications.some((item) => item.href === `/positions/${accepted.body.position.id}`)).toBe(false);
    await alertsPatch(request("/api/alerts", "PATCH", { id: alert.body.alert.id, paused: false }));
    const checked = await json<{ alerts: { id: string; triggeredAt?: string }[]; notifications: { id: string; href: string; title: string; read: boolean }[] }>(await alertsGet());
    expect(checked.body.alerts.find((item) => item.id === alert.body.alert.id)?.triggeredAt).toBeDefined();
    expect(checked.body.notifications.some((item) => item.href === `/positions/${accepted.body.position.id}` && item.title === "Position outcome available")).toBe(true);
    const checkedAgain = await json<{ notifications: { href: string }[] }>(await alertsGet());
    expect(checkedAgain.body.notifications.filter((item) => item.href === `/positions/${accepted.body.position.id}`).length).toBe(1);
    const notification = checked.body.notifications.find((item) => item.href === `/positions/${accepted.body.position.id}`)!;
    const read = await json<{ notification: { read: boolean } }>(await alertsPatch(request("/api/alerts", "PATCH", { id: notification.id, action: "read" })));
    expect(read.body.notification.read).toBe(true);
    const unread = await json<{ notification: { read: boolean } }>(await alertsPatch(request("/api/alerts", "PATCH", { id: notification.id, action: "unread" })));
    expect(unread.body.notification.read).toBe(false);

    const claimed = await json<{ position: { status: string }; duplicate?: boolean }>(await positionPatch(request(`/api/positions/${accepted.body.position.id}`, "PATCH", { action: "claim" }), { params: { id: accepted.body.position.id } }));
    expect(claimed.response.status).toBe(200);
    expect(claimed.body.position.status).toBe("claimed");
    const repeatedClaim = await json<{ position: { status: string }; duplicate?: boolean }>(await positionPatch(request(`/api/positions/${accepted.body.position.id}`, "PATCH", { action: "claim" }), { params: { id: accepted.body.position.id } }));
    expect(repeatedClaim.response.status).toBe(200);
    expect(repeatedClaim.body.position.status).toBe("claimed");

    cookieJar.values.delete("thesis_session");
    cookieJar.values.set("thesis_guest", "guest_00000000-0000-4000-8000-000000000001");
    const privateThesis = await json<{ message?: string }>(await thesisGet(request(`/api/theses/${thesisId}`), { params: { id: thesisId } }));
    const privateQuote = await json<{ message?: string }>(await quoteGet(request(`/api/quotes/${quote.body.quote.id}`), { params: { id: quote.body.quote.id } }));
    const privatePosition = await json<{ message?: string }>(await positionGet(request(`/api/positions/${accepted.body.position.id}`), { params: { id: accepted.body.position.id } }));
    expect(privateThesis.response.status).toBe(404);
    expect(privateQuote.response.status).toBe(404);
    expect(privatePosition.response.status).toBe(404);
    expect((await alertsGet()).status).toBe(401);
    cookieJar.values.delete("thesis_guest");
  });

  it("clarifies settlement timing and listed boundaries before returning a range proposal", async () => {
    const list = await json<{ families: { slug: string; sourceEvent: { ticker: string } }[] }>(await topicsGet(request("/api/topics?mode=replay")));
    const family = list.body.families.find((item) => item.sourceEvent.ticker === "BTC2611202200");
    expect(family).toBeDefined();

    const turns: { role: "user" | "assistant"; content: string }[] = [
      { role: "user", content: "I expect a rise, but not a breakout." },
    ];
    const first = await json<{ clarificationPrompt?: string; proposed?: unknown }>(await researchPost(request("/api/research", "POST", {
      question: turns[0].content, conversation: turns, slug: family!.slug, mode: "replay", context: "research",
    })));
    expect(first.response.status).toBe(200);
    expect(first.body.clarificationPrompt).toContain("official settlement");
    expect(first.body.proposed).toBeUndefined();

    turns.push({ role: "assistant", content: first.body.clarificationPrompt! });
    turns.push({ role: "user", content: "At Friday's settlement." });
    const second = await json<{ clarificationPrompt?: string; proposed?: unknown }>(await researchPost(request("/api/research", "POST", {
      question: turns.at(-1)!.content, conversation: turns, slug: family!.slug, mode: "replay", context: "research",
    })));
    expect(second.body.clarificationPrompt).toContain("Would a range from");
    expect(second.body.proposed).toBeUndefined();

    turns.push({ role: "assistant", content: second.body.clarificationPrompt! });
    turns.push({ role: "user", content: "Yes, use this range." });
    const final = await json<{ proposed?: { template: string; lowerThreshold: number; upperThreshold: number }; clarificationPrompt?: string }>(await researchPost(request("/api/research", "POST", {
      question: turns.at(-1)!.content, conversation: turns, slug: family!.slug, mode: "replay", context: "research",
    })));
    expect(final.body.clarificationPrompt).toBeUndefined();
    expect(final.body.proposed).toMatchObject({ template: "range" });
    expect(final.body.proposed!.lowerThreshold).toBeLessThan(final.body.proposed!.upperThreshold);
  });
});
