import { capabilities } from "@/lib/capabilities";
import { fail, ok, readJson } from "@/lib/server/http";

const DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";

export async function POST(req: Request) {
  const cap = capabilities().voice;
  if (cap.state !== "available") {
    return fail("UNAVAILABLE", cap.reason, 501);
  }
  let body: { text?: unknown; voiceId?: unknown };
  try {
    body = await readJson<typeof body>(req);
  } catch {
    return fail("INVALID", "Provide text as a JSON request body.");
  }
  if (!body || typeof body !== "object") return fail("INVALID", "Provide text as a JSON request body.");
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return fail("INVALID", "Enter text to speak.");
  if (text.length > 3_000) return fail("INVALID", "Keep spoken replies under 3,000 characters.");

  const voiceId = (typeof body.voiceId === "string" ? body.voiceId : process.env.ELEVENLABS_VOICE_ID) || DEFAULT_VOICE_ID;
  if (!/^[A-Za-z0-9_-]{10,64}$/.test(voiceId)) return fail("INVALID", "Unknown voice selection.");

  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_22050_32`, {
      method: "POST",
      headers: {
        "xi-api-key": process.env.ELEVENLABS_API_KEY as string,
        "content-type": "application/json",
        accept: "audio/mpeg",
      },
      body: JSON.stringify({ text, model_id: "eleven_multilingual_v2" }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) return fail("UNAVAILABLE", "ElevenLabs rejected the key or voice permission.", 502);
      if (res.status === 429) return fail("UNAVAILABLE", "ElevenLabs rate limit or account quota reached.", 503);
      return fail("UNAVAILABLE", "ElevenLabs could not generate this reply.", 502);
    }
    return new Response(res.body, { headers: { "content-type": "audio/mpeg", "cache-control": "no-store" } });
  } catch {
    return fail("UNAVAILABLE", "ElevenLabs could not be reached. The written reply is still available.", 502);
  }
}
