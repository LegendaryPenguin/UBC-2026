import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const capability = vi.hoisted(() => ({ state: "available" as "available" | "unavailable" }));

vi.mock("@/lib/capabilities", () => ({
  capabilities: () => ({ voice: { state: capability.state, reason: "Voice is disabled in this test." } }),
}));

import { POST as speakPost } from "@/app/api/voice/route";
import { POST as transcribePost } from "@/app/api/voice/transcribe/route";

const originalKey = process.env.ELEVENLABS_API_KEY;

function jsonRequest(url: string, body: unknown) {
  return new Request(`http://localhost${url}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  capability.state = "available";
  process.env.ELEVENLABS_API_KEY = "server-test-key";
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalKey === undefined) delete process.env.ELEVENLABS_API_KEY;
  else process.env.ELEVENLABS_API_KEY = originalKey;
});

describe("server-side ElevenLabs adapters", () => {
  it("sends TTS requests server-side and returns uncached audio bytes", async () => {
    const providerFetch = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    vi.stubGlobal("fetch", providerFetch);
    const response = await speakPost(jsonRequest("/api/voice", { text: "  Review the middle scenario.  " }));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("audio/mpeg");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.arrayBuffer()).byteLength).toBe(3);
    const [url, init] = providerFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/v1/text-to-speech/");
    expect(new Headers(init.headers).get("xi-api-key")).toBe("server-test-key");
    expect(JSON.parse(String(init.body))).toMatchObject({ text: "Review the middle scenario.", model_id: "eleven_multilingual_v2" });
  });

  it("transcribes browser audio with Scribe v2 without returning provider credentials", async () => {
    const providerFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: "I expect a rise, but not a breakout.", language_code: "en" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", providerFetch);
    const form = new FormData();
    form.append("audio", new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" }), "thesis-voice.webm");
    const response = await transcribePost(new Request("http://localhost/api/voice/transcribe", { method: "POST", body: form }));
    const body = await response.json() as { text: string; languageCode: string; error?: { message: string } };

    expect(response.status).toBe(200);
    expect(body).toEqual({ text: "I expect a rise, but not a breakout.", languageCode: "en" });
    expect(JSON.stringify(body)).not.toContain("server-test-key");
    const [url, init] = providerFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.elevenlabs.io/v1/speech-to-text");
    expect(new Headers(init.headers).get("xi-api-key")).toBe("server-test-key");
    const sentForm = init.body as FormData;
    expect(sentForm.get("model_id")).toBe("scribe_v2");
    expect(sentForm.get("tag_audio_events")).toBe("false");
  });

  it("keeps text fallback available for disabled voice and provider errors", async () => {
    const providerFetch = vi.fn();
    vi.stubGlobal("fetch", providerFetch);
    capability.state = "unavailable";
    const disabled = await speakPost(jsonRequest("/api/voice", { text: "Hello" }));
    expect(disabled.status).toBe(501);
    expect(providerFetch).not.toHaveBeenCalled();

    capability.state = "available";
    providerFetch.mockResolvedValueOnce(new Response("quota", { status: 429 }));
    const limited = await speakPost(jsonRequest("/api/voice", { text: "Hello" }));
    const error = await limited.json() as { error?: { message?: string } };
    expect(limited.status).toBe(503);
    expect(error.error?.message).toContain("rate limit");
    expect(JSON.stringify(error)).not.toContain("server-test-key");
  });

  it("rejects empty, unsupported, and oversized audio before calling ElevenLabs", async () => {
    const providerFetch = vi.fn();
    vi.stubGlobal("fetch", providerFetch);

    const empty = new FormData();
    const emptyResponse = await transcribePost(new Request("http://localhost/api/voice/transcribe", { method: "POST", body: empty }));
    expect(emptyResponse.status).toBe(400);

    const unsupported = new FormData();
    unsupported.append("audio", new Blob(["text"], { type: "text/plain" }), "voice.txt");
    const unsupportedResponse = await transcribePost(new Request("http://localhost/api/voice/transcribe", { method: "POST", body: unsupported }));
    expect(unsupportedResponse.status).toBe(400);

    const oversized = new FormData();
    oversized.append("audio", new Blob([new Uint8Array(8 * 1024 * 1024 + 1)], { type: "audio/webm" }), "large.webm");
    const oversizedResponse = await transcribePost(new Request("http://localhost/api/voice/transcribe", { method: "POST", body: oversized }));
    expect(oversizedResponse.status).toBe(400);
    expect(providerFetch).not.toHaveBeenCalled();
  });
});
