import { capabilities } from "@/lib/capabilities";
import { fail, ok, readJson } from "@/lib/server/http";

export async function POST(req: Request) {
  const cap = capabilities().voice;
  if (cap.state !== "available") {
    return fail("UNAVAILABLE", cap.reason, 501);
  }
  const body = await readJson<{ text: string; voiceId?: string }>(req);
  const res = await fetch("https://api.elevenlabs.io/v1/text-to-speech/" + (body.voiceId || "JBFqnCBsd6RMkjVFRP7b"), {
    method: "POST",
    headers: {
      "xi-api-key": process.env.ELEVENLABS_API_KEY as string,
      "content-type": "application/json",
      accept: "audio/mpeg",
    },
    body: JSON.stringify({ text: body.text, model_id: "eleven_multilingual_v2" }),
  });
  if (!res.ok) return fail("UNAVAILABLE", `ElevenLabs ${res.status}`, 502);
  const buf = Buffer.from(await res.arrayBuffer());
  return new Response(buf, { headers: { "content-type": "audio/mpeg" } });
}
