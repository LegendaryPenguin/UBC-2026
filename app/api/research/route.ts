import { getTopic } from "@/lib/gemini/catalog";
import { researchReply } from "@/lib/research";
import { fail, ok, readJson } from "@/lib/server/http";
import { mutate } from "@/lib/server/store";

export async function POST(req: Request) {
  const body = await readJson<{ question: string; slug?: string; thesisId?: string; mode?: string }>(req);
  if (!body.question?.trim()) return fail("INVALID", "Ask a question");
  const family = body.slug ? await getTopic(body.slug, body.mode === "live" ? "live" : "replay") : null;
  const thesis = body.thesisId ? mutate((s) => s.theses.find((t) => t.id === body.thesisId)) : null;
  if (process.env.XAI_API_KEY) {
    try {
      const res = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${process.env.XAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "grok-4",
          messages: [
            {
              role: "system",
              content:
                "You help a user form a prediction-market thesis. Cite only provided source cards. Never instruct a trade. Distinguish Gemini odds from executable Arc quotes.",
            },
            {
              role: "user",
              content: JSON.stringify({ question: body.question, family, thesis }),
            },
          ],
        }),
      });
      if (res.ok) {
        const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        const answer = json.choices?.[0]?.message?.content || "";
        return ok({ answer, citations: [], provider: "grok" });
      }
    } catch {
      /* fall through */
    }
  }
  return ok({ ...researchReply({ question: body.question, family, thesis }), provider: "local" });
}
