import { fail, ok } from "@/lib/server/http";
import { thesisOwner } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export async function POST() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  if (!apiKey || !agentId) {
    return fail("VOICE_UNAVAILABLE", "Realtime voice is not configured. Push-to-talk and text remain available.", 503);
  }
  const owner = thesisOwner(true);
  if (!owner) return fail("AUTH", "A guest or signed-in workspace is required.", 401);
  try {
    const params = new URLSearchParams({ agent_id: agentId, participant_name: owner });
    const response = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/token?${params}`, {
      headers: { "xi-api-key": apiKey },
      cache: "no-store",
    });
    if (!response.ok) {
      return fail("VOICE_UNAVAILABLE", "ElevenLabs could not start a realtime session. Push-to-talk and text remain available.", 503);
    }
    const body = await response.json() as { token?: string; conversation_id?: string };
    if (!body.token) return fail("VOICE_UNAVAILABLE", "ElevenLabs did not return a realtime session token.", 503);
    return ok({ token: body.token, conversationId: body.conversation_id || null });
  } catch {
    return fail("VOICE_UNAVAILABLE", "Realtime voice could not connect. Push-to-talk and text remain available.", 503);
  }
}
