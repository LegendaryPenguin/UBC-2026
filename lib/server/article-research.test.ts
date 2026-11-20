import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/article-research/route";

vi.mock("@/lib/server/session", () => ({ thesisOwner: () => "article-test-user" }));

const article = {
  title: "Texas–Texas A&M football rivalry",
  url: "https://en.wikipedia.org/wiki/Texas%E2%80%93Texas_A%26M_football_rivalry",
  text: "Texas and Texas A&M met on the football field again in 2024 after a break in the annual series.",
};

function research(value: unknown) {
  return POST(new Request("http://localhost/api/article-research", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value),
  }));
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("article research", () => {
  it("uses the captured text and recognizes both Wikipedia URL encodings", async () => {
    vi.stubEnv("XAI_API_KEY", "");
    for (const url of [article.url, article.url.replace("%26", "&")]) {
      const response = await research({ ...article, url });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        provider: "extract",
        summary: article.text,
        sources: [
          { publisher: "Texas Athletics" },
          { publisher: "Texas A&M Athletics" },
          { publisher: "Southeastern Conference" },
        ],
      });
    }
  });

  it("grounds the optional Grok brief in the capture and validates the source URL", async () => {
    vi.stubEnv("XAI_API_KEY", "test-key");
    const requestModel = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      choices: [{ message: { content: "A research brief based on the article." } }],
    }));
    vi.stubGlobal("fetch", requestModel);

    expect((await research({ ...article, url: "javascript:alert(1)" })).status).toBe(400);
    expect(requestModel).not.toHaveBeenCalled();

    const response = await research(article);
    expect(await response.json()).toMatchObject({ provider: "grok", summary: "A research brief based on the article." });
    const body = JSON.parse(String(requestModel.mock.calls[0][1]?.body));
    expect(JSON.parse(body.messages[1].content)).toMatchObject({ title: article.title, articleText: article.text });
  });
});
