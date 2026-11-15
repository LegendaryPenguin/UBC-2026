import { geminiAccessToken } from "@/lib/gemini/oauth";

const BASE = "https://api.gemini.com";

export class GeminiPrivateApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function geminiPrivateRequest<T>(
  accountId: string,
  path: string,
  body: Record<string, unknown>,
  requiredScope: string,
): Promise<T> {
  const { token, scopes } = await geminiAccessToken(accountId);
  if (!scopes.includes(requiredScope)) throw new GeminiPrivateApiError(`Gemini permission ${requiredScope} is required`, 403);
  const payload = Buffer.from(JSON.stringify({ request: path, ...body })).toString("base64");
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method: ["/v1/prediction-markets/terms", "/v1/prediction-markets/terms/status"].includes(path) ? "GET" : "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "x-gemini-payload": payload,
        "content-type": "application/json",
      },
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });
  } catch {
    throw new GeminiPrivateApiError("Gemini could not be reached. No order action was retried.", 503);
  }
  if (!response.ok) throw new GeminiPrivateApiError(`Gemini rejected the request (${response.status})`, response.status);
  try {
    return await response.json() as T;
  } catch {
    throw new GeminiPrivateApiError("Gemini returned an unreadable response", 502);
  }
}
