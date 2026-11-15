import { capabilities } from "@/lib/capabilities";
import { fail, ok } from "@/lib/server/http";

const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const ALLOWED_AUDIO_TYPES = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
]);

export async function POST(req: Request) {
  const cap = capabilities().voice;
  if (cap.state !== "available") return fail("UNAVAILABLE", cap.reason, 501);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("INVALID", "Choose a recording before transcribing it.");
  }
  const audio = form.get("audio");
  if (!audio || typeof audio === "string" || audio.size === 0) return fail("INVALID", "The recording is empty.");
  if (audio.size > MAX_AUDIO_BYTES) return fail("INVALID", "Keep recordings under eight megabytes.");
  const audioType = audio.type.split(";")[0].trim().toLowerCase();
  if (!ALLOWED_AUDIO_TYPES.has(audioType)) return fail("INVALID", "This browser's audio format is not supported.");

  const requestBody = new FormData();
  requestBody.append("file", audio, audio.name || "thesis-voice.webm");
  requestBody.append("model_id", "scribe_v2");
  requestBody.append("tag_audio_events", "false");

  try {
    const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY as string },
      body: requestBody,
      signal: AbortSignal.timeout(90_000),
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) return fail("UNAVAILABLE", "ElevenLabs rejected the key or transcription permission.", 502);
      if (response.status === 429) return fail("UNAVAILABLE", "ElevenLabs rate limit or account quota reached.", 503);
      if (response.status === 422) return fail("INVALID", "ElevenLabs could not read this recording. Try again or type your question.");
      return fail("UNAVAILABLE", "ElevenLabs could not transcribe this recording.", 502);
    }

    const result = (await response.json()) as { text?: unknown; language_code?: unknown };
    const text = typeof result.text === "string" ? result.text.trim() : "";
    if (!text) return fail("INVALID", "No speech was recognized. Try again or type your question.");
    return ok({ text, languageCode: typeof result.language_code === "string" ? result.language_code : null });
  } catch {
    return fail("UNAVAILABLE", "ElevenLabs could not be reached. Your recording was not saved by this app.", 502);
  }
}
