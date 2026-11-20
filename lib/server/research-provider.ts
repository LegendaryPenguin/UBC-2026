const researchWindows = new Map<string, number[]>();
const MAX_REQUESTS_PER_MINUTE = 10;

export function takeResearchBudget(owner: string) {
  const now = Date.now();
  const recent = (researchWindows.get(owner) || []).filter((at) => now - at < 60_000);
  if (recent.length >= MAX_REQUESTS_PER_MINUTE) {
    researchWindows.set(owner, recent);
    return false;
  }
  recent.push(now);
  researchWindows.set(owner, recent);
  if (researchWindows.size > 2_000) {
    for (const [key, times] of researchWindows) {
      if (times.every((at) => now - at >= 60_000)) researchWindows.delete(key);
    }
  }
  return true;
}

export async function grokResearch(instructions: string, context: object) {
  const key = process.env.XAI_API_KEY;
  if (!key) return null;

  try {
    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "grok-4",
        messages: [
          { role: "system", content: instructions },
          { role: "user", content: JSON.stringify(context) },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return null;
    const json = await response.json() as { choices?: { message?: { content?: unknown } }[] };
    const content = json.choices?.[0]?.message?.content;
    return typeof content === "string" && content.trim() ? content : null;
  } catch {
    return null;
  }
}
